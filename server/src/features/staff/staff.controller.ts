import type { Response } from 'express';
import { supabase } from '../../config/supabase/supabase.config.ts';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import { updateStaffProfileValidator } from './modules/validators/staff.validator.ts';
import { ADMIN_ROLES } from './staff.types.ts';

export async function listStaffController(
  req: AuthenticatedRequest,
  res: Response
) {
  const role = req.user?.role;
  const branchId = req.user?.branch_id;

  if (!role || !branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let query = supabase.from('staff_profiles').select('*');

    if (role !== 'Superadmin') {
      query = query.eq('branch_id', branchId);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ staff: data ?? [] });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getStaffProfileController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;
  const targetId = req.params.id;

  if (!requesterId || !requesterRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const isSelf = requesterId === targetId;

  if (!isSelf && !ADMIN_ROLES.includes(requesterRole)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { data, error } = await supabase
      .from('staff_profiles')
      .select('*')
      .eq('id', targetId)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Staff profile not found' });
    }

    // Admins are scoped to their own branch; Superadmins may cross branches.
    if (
      !isSelf &&
      requesterRole === 'Admin' &&
      data.branch_id !== requesterBranchId
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.status(200).json({ staff: data });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateStaffProfileController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;
  const targetId = req.params.id;

  if (!requesterId || !requesterRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const isSelf = requesterId === targetId;

  if (!isSelf && !ADMIN_ROLES.includes(requesterRole)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const parsed = updateStaffProfileValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    if (!isSelf && requesterRole === 'Admin') {
      const { data: targetProfile, error: lookupError } = await supabase
        .from('staff_profiles')
        .select('branch_id')
        .eq('id', targetId)
        .maybeSingle();

      if (lookupError) {
        return res.status(400).json({ error: lookupError.message });
      }

      if (!targetProfile) {
        return res.status(404).json({ error: 'Staff profile not found' });
      }

      if (targetProfile.branch_id !== requesterBranchId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const { data, error } = await supabase
      .from('staff_profiles')
      .update(parsed.data)
      .eq('id', targetId)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!data) {
      return res.status(404).json({ error: 'Staff profile not found' });
    }

    return res.status(200).json({ staff: data });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
