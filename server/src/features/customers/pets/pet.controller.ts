import type { Response } from 'express';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { AuthenticatedRequest } from '../../../shared/shared.types.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import {
  CUSTOMER_ARCHIVE_ROLES,
  CUSTOMER_MANAGER_ROLES,
} from '../customer.types.ts';
import {
  createPetValidator,
  createPetValidatorStaff,
  updatePetValidator,
  updatePetValidatorStaff,
} from './modules/validators/pet.validator.ts';
import {
  archivePet,
  deactivatePet,
  hardDeletePet,
  listArchivedPets,
  restorePet,
} from './services/petArchive.service.ts';

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    error instanceof Error && 'statusCode' in error
      ? Number((error as Error & { statusCode?: number }).statusCode)
      : 500;

  const message =
    error instanceof Error ? error.message : 'Internal server error';

  return res.status(statusCode).json({ error: message });
}

async function isAuthorizedStaff(requesterId: string): Promise<boolean> {
  const role = await getStaffRoleOrNull(requesterId);
  return role !== null && CUSTOMER_MANAGER_ROLES.includes(role);
}

/** Archiving/restoring/hard-deleting a pet is Admin-tier for staff (matches
 * CUSTOMER_ARCHIVE_ROLES elsewhere), but the pet's own owner may still
 * archive their own pet (e.g. deceased/rehomed) the same way they could
 * previously hard-delete it. */
async function isAuthorizedForPetArchive(
  requesterId: string
): Promise<boolean> {
  const role = await getStaffRoleOrNull(requesterId);
  return role !== null && CUSTOMER_ARCHIVE_ROLES.includes(role);
}

/**
 * Broader than CUSTOMER_MANAGER_ROLES, for single-record lookup only (GET
 * /pets/:id) - mirrors customer.controller.ts's own
 * isAuthorizedForProfileLookup: a Groomer/Veterinarian needs to see whose
 * pet they're servicing in their own queue, but that's not the same as the
 * broader CUSTOMER_MANAGER_ROLES-gated ability to list/create/update/delete
 * any customer's pets.
 */
const PET_LOOKUP_ROLES: readonly string[] = [
  ...CUSTOMER_MANAGER_ROLES,
  'Groomer',
  'Veterinarian',
];

async function isAuthorizedForPetLookup(requesterId: string): Promise<boolean> {
  const role = await getStaffRoleOrNull(requesterId);
  return role !== null && PET_LOOKUP_ROLES.includes(role);
}

function paramId(req: AuthenticatedRequest, name: string): string | undefined {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

async function resolvePet(petId: string) {
  return supabase.from('pets').select('*').eq('id', petId).maybeSingle();
}

/**
 * assessed_by/assessed_at are never accepted from client input (see
 * pet.validator.ts's header) - stamped here rather than by the DB trigger,
 * since every write in this codebase goes through the shared service-role
 * Supabase client with no per-request auth context for the trigger to read
 * (see ...075_m02_pets_assessment_trigger_fix.sql). Only stamps when the
 * pet ends up fully assessed (both fields non-null after this write) -
 * matches the trigger's original intent, not "a field changed."
 */
function resolveAssessmentStamp(
  isStaff: boolean,
  requesterId: string,
  finalWeightClass: string | null | undefined,
  finalCoatType: string | null | undefined
): { assessed_by?: string; assessed_at?: string } {
  if (!isStaff || !finalWeightClass || !finalCoatType) {
    return {};
  }

  return { assessed_by: requesterId, assessed_at: new Date().toISOString() };
}

export async function listCustomerPetsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const customerId = paramId(req, 'customerId');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const isSelf = requesterId === customerId;

  if (!isSelf && !(await isAuthorizedStaff(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { data, error } = await supabase
      .from('pets')
      .select('*')
      .eq('customer_id', customerId)
      .is('archived_at', null);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ pets: data ?? [] });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createPetController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const customerId = paramId(req, 'customerId');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const isSelf = requesterId === customerId;
  // Short-circuited exactly like the original authorization check below (no
  // role lookup at all for the common self-service path) - isSelf already
  // unambiguously means "the logged-in customer creating their own pet" per
  // this route's own contract, so it always gets the customer validator
  // regardless of whether that same auth.uid happens to also hold a staff
  // role elsewhere.
  const isStaff = isSelf ? false : await isAuthorizedStaff(requesterId);

  if (!isSelf && !isStaff) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Only a staff-authorized caller (creating on behalf of another customer)
  // may set weight_class/coat_type at create time (see pet.validator.ts's
  // header) - a customer creating their own pet always gets createPetValidator,
  // which doesn't accept those fields at all.
  const validator = isStaff ? createPetValidatorStaff : createPetValidator;
  const parsed = validator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const submitted = parsed.data as {
      weight_class?: string;
      coat_type?: string;
    };
    const stamp = resolveAssessmentStamp(
      isStaff,
      requesterId,
      submitted.weight_class,
      submitted.coat_type
    );

    const { data, error } = await supabase
      .from('pets')
      .insert({ ...parsed.data, customer_id: customerId, ...stamp })
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(201).json({ pet: data });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPetController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const petId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data: pet, error } = await resolvePet(petId as string);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!pet) {
      return res.status(404).json({ error: 'Pet not found' });
    }

    const isOwner = pet.customer_id === requesterId;

    if (!isOwner && !(await isAuthorizedForPetLookup(requesterId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.status(200).json({ pet });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updatePetController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const petId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data: pet, error: lookupError } = await resolvePet(petId as string);

    if (lookupError) {
      return res.status(400).json({ error: lookupError.message });
    }

    if (!pet) {
      return res.status(404).json({ error: 'Pet not found' });
    }

    const isOwner = pet.customer_id === requesterId;
    // Short-circuited exactly like the original authorization check (no role
    // lookup for the common self-service path) - isOwner already unambiguously
    // means "the pet-owning customer editing their own pet" per this route's
    // own contract (PetDetailPanel.tsx), so it always gets the customer
    // validator regardless of whether that same auth.uid happens to also hold
    // a staff role elsewhere.
    const isStaff = isOwner ? false : await isAuthorizedStaff(requesterId);

    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Only a staff-authorized caller may set weight_class/coat_type (see
    // pet.validator.ts's header) - the pet's own owner always gets
    // updatePetValidator, which doesn't accept those fields at all.
    const validator = isStaff ? updatePetValidatorStaff : updatePetValidator;
    const parsed = validator.safeParse(req.body);

    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid payload', details: parsed.error.issues });
    }

    const submitted = parsed.data as {
      weight_class?: string;
      coat_type?: string;
    };

    // Only re-stamp when weight_class/coat_type actually change value - the
    // staff edit form re-sends both fields on every save regardless of
    // whether the staff member touched them, so "the key is present" alone
    // isn't "assessed just now" (that would make an unrelated name/photo
    // edit look like a fresh assessment).
    const weightClassChanged =
      'weight_class' in submitted &&
      submitted.weight_class !== pet.weight_class;
    const coatTypeChanged =
      'coat_type' in submitted && submitted.coat_type !== pet.coat_type;

    const stamp = resolveAssessmentStamp(
      isStaff && (weightClassChanged || coatTypeChanged),
      requesterId,
      'weight_class' in submitted ? submitted.weight_class : pet.weight_class,
      'coat_type' in submitted ? submitted.coat_type : pet.coat_type
    );

    const { data, error } = await supabase
      .from('pets')
      .update({ ...parsed.data, ...stamp })
      .eq('id', petId)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ pet: data });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Was a hard delete before the archive workflow - now soft (still gated
 * behind is_active === false via archivePet's own guard). The pet's owner
 * may still archive their own pet, same access this endpoint always had;
 * hard-delete-from-archive below is Admin-tier only.
 */
export async function archivePetController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const petId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data: pet, error: lookupError } = await resolvePet(petId as string);

    if (lookupError) {
      return res.status(400).json({ error: lookupError.message });
    }

    if (!pet) {
      return res.status(404).json({ error: 'Pet not found' });
    }

    const isOwner = pet.customer_id === requesterId;

    if (!isOwner && !(await isAuthorizedStaff(requesterId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await archivePet(petId as string);
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deactivatePetController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const petId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data: pet, error: lookupError } = await resolvePet(petId as string);

    if (lookupError) {
      return res.status(400).json({ error: lookupError.message });
    }

    if (!pet) {
      return res.status(404).json({ error: 'Pet not found' });
    }

    const isOwner = pet.customer_id === requesterId;

    if (!isOwner && !(await isAuthorizedStaff(requesterId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await deactivatePet(petId as string);
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restorePetController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const petId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!(await isAuthorizedForPetArchive(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await restorePet(petId as string);
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listArchivedPetsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const customerId = paramId(req, 'customerId');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!(await isAuthorizedForPetArchive(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const pets = await listArchivedPets(customerId);
    return res.status(200).json({ pets });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function hardDeletePetController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const petId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!(await isAuthorizedForPetArchive(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await hardDeletePet(petId as string);
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}
