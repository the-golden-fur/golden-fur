import type { Response } from 'express';
import { supabase } from '../../config/supabase/supabase.config.ts';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import { getStaffRoleOrNull } from '../../shared/auth/api/supabaseAuth.api.ts';
import { updateCustomerProfileValidator } from './modules/validators/customer.validator.ts';
import {
  CUSTOMER_ARCHIVE_ROLES,
  CUSTOMER_MANAGER_ROLES,
} from './customer.types.ts';
import {
  activateCustomer,
  archiveCustomer,
  deactivateCustomer,
  hardDeleteCustomer,
  listArchivedCustomers,
  restoreCustomer,
} from './services/customerArchive.service.ts';

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    error instanceof Error && 'statusCode' in error
      ? Number((error as Error & { statusCode?: number }).statusCode)
      : 500;

  const message =
    error instanceof Error ? error.message : 'Internal server error';

  return res.status(statusCode).json({ error: message });
}

async function isAuthorizedAdmin(requesterId: string): Promise<boolean> {
  const role = await getStaffRoleOrNull(requesterId);
  return role !== null && CUSTOMER_ARCHIVE_ROLES.includes(role);
}

/**
 * Customer routes are reachable by both a customer (acting on their own
 * row) and staff (acting on any row) - there is no single role list that
 * covers both, so unlike staff.routes.ts these routes only run
 * jwtMiddleware, and each controller resolves "self, or authorized staff"
 * itself via this helper instead of requireRole (which always 403s a
 * caller with no staff_profiles row, i.e. every customer).
 */
async function isAuthorizedStaff(requesterId: string): Promise<boolean> {
  const role = await getStaffRoleOrNull(requesterId);
  return role !== null && CUSTOMER_MANAGER_ROLES.includes(role);
}

/**
 * Broader than CUSTOMER_MANAGER_ROLES, for single-record lookup only (GET
 * /customers/:id) - mirrors VACCINATION_MANAGER_ROLES's own precedent
 * (vaccinationRecord.service.ts) of extending a narrow, read-only action to
 * a role that legitimately needs it: a Groomer/Veterinarian needs to see
 * whose pet they're servicing in their own queue (GroomerDashboardPage/
 * VeterinaryConsolePage), but that's not the same as the broader
 * CUSTOMER_MANAGER_ROLES-gated ability to list/edit every customer.
 */
const PROFILE_LOOKUP_ROLES: readonly string[] = [
  ...CUSTOMER_MANAGER_ROLES,
  'Groomer',
  'Veterinarian',
];

async function isAuthorizedForProfileLookup(
  requesterId: string
): Promise<boolean> {
  const role = await getStaffRoleOrNull(requesterId);
  return role !== null && PROFILE_LOOKUP_ROLES.includes(role);
}

function paramId(req: AuthenticatedRequest, name: string): string | undefined {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

export async function listCustomersController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!(await isAuthorizedStaff(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    let query = supabase
      .from('customer_profiles')
      .select('*')
      .is('archived_at', null);

    const email = req.query.email;
    if (typeof email === 'string' && email.trim().length > 0) {
      query = query.eq('account_email', email.trim());
    }

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ customers: data ?? [] });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getCustomerProfileController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const targetId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const isSelf = requesterId === targetId;

  if (!isSelf && !(await isAuthorizedForProfileLookup(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('*')
      .eq('id', targetId)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Customer profile not found' });
    }

    return res.status(200).json({ customer: data });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateCustomerProfileController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const targetId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const isSelf = requesterId === targetId;

  if (!isSelf && !(await isAuthorizedStaff(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const parsed = updateCustomerProfileValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const { data, error } = await supabase
      .from('customer_profiles')
      .update(parsed.data)
      .eq('id', targetId)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Customer profile not found' });
    }

    return res.status(200).json({ customer: data });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deactivateCustomerController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const targetId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!(await isAuthorizedAdmin(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await deactivateCustomer(targetId as string);
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function activateCustomerController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const targetId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!(await isAuthorizedAdmin(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await activateCustomer(targetId as string);
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function archiveCustomerController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const targetId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!(await isAuthorizedAdmin(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await archiveCustomer(targetId as string);
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function restoreCustomerController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const targetId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!(await isAuthorizedAdmin(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await restoreCustomer(targetId as string);
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listArchivedCustomersController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!(await isAuthorizedAdmin(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const customers = await listArchivedCustomers();
    return res.status(200).json({ customers });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function hardDeleteCustomerController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const targetId = paramId(req, 'id');

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!(await isAuthorizedAdmin(requesterId))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await hardDeleteCustomer(targetId as string);
    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}
