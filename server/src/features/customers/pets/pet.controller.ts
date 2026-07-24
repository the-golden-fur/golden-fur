import type { Response } from 'express';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { AuthenticatedRequest } from '../../../shared/shared.types.ts';
import { getStaffRoleOrNull } from '../../../shared/auth/api/supabaseAuth.api.ts';
import { CUSTOMER_MANAGER_ROLES } from '../customer.types.ts';
import {
  createPetValidator,
  updatePetValidator,
} from './modules/validators/pet.validator.ts';

async function isAuthorizedStaff(requesterId: string): Promise<boolean> {
  const role = await getStaffRoleOrNull(requesterId);
  return role !== null && CUSTOMER_MANAGER_ROLES.includes(role);
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
      .eq('customer_id', customerId);

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

  if (!isSelf && !(await isAuthorizedStaff(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const parsed = createPetValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const { data, error } = await supabase
      .from('pets')
      .insert({ ...parsed.data, customer_id: customerId })
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

  const parsed = updatePetValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
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

    const { data, error } = await supabase
      .from('pets')
      .update(parsed.data)
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

export async function deletePetController(
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

    const { error } = await supabase.from('pets').delete().eq('id', petId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
