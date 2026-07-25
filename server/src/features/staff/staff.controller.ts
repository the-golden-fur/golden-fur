import type { NextFunction, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { supabase } from '../../config/supabase/supabase.config.ts';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  createStaffAccountValidator,
  manageStaffAccountValidator,
  updateStaffProfileValidator,
} from './modules/validators/staff.validator.ts';
import { uploadStaffAvatar } from './services/avatarUpload.service.ts';
import { resendAccountEmail } from './services/resendAccountEmail.service.ts';
import {
  createStaffAccount,
  manageStaffAccount,
} from './services/staffManagement.service.ts';
import {
  cancelUnavailabilityBlock,
  createUnavailabilityBlock,
  listPendingUnavailabilityBlocks,
  listUnavailabilityBlocks,
  reviewUnavailabilityBlock,
} from './services/unavailabilityBlock.service.ts';
import { ADMIN_ROLES } from './staff.types.ts';

const createUnavailabilityBlockValidator = z
  .object({
    quick_action: z.boolean().optional(),
    start_time: z.string().min(1).optional(),
    end_time: z.string().min(1).optional(),
    reason: z.string().trim().min(1).optional(),
  })
  .strict();

const reviewUnavailabilityBlockValidator = z
  .object({
    decision: z.enum(['approved', 'denied']),
    denial_reason: z.string().trim().min(1).optional(),
  })
  .strict();

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    error instanceof Error && 'statusCode' in error
      ? Number((error as Error & { statusCode?: number }).statusCode)
      : 500;

  const message =
    error instanceof Error ? error.message : 'Internal server error';

  return res.status(statusCode).json({ error: message });
}

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
  const targetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;

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

export function handleAvatarUploadError(
  err: unknown,
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }

    return res.status(400).json({ error: err.message });
  }

  if (err) {
    return res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Upload failed' });
  }

  return next();
}

export async function uploadAvatarController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const targetId = (
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  ) as string;

  if (!requesterId || !requesterRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const file = req.file as
    | {
        buffer: Buffer;
        mimetype: string;
        originalname: string;
        size: number;
      }
    | undefined;

  if (!file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  try {
    const result = await uploadStaffAvatar({
      requesterId,
      requesterRole,
      targetId,
      file,
    });

    return res.status(200).json({ profile_photo_url: result.avatarUrl });
  } catch (error) {
    const statusCode =
      error instanceof Error && 'statusCode' in error
        ? Number((error as Error & { statusCode?: number }).statusCode)
        : 500;

    const message =
      error instanceof Error ? error.message : 'Internal server error';

    return res.status(statusCode).json({ error: message });
  }
}

export async function updateStaffProfileController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;
  const targetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;

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

/**
 * M01 Process 1: Admin Creates a Staff Account. Route-level requireRole
 * already restricts this to Admin/Superadmin; the Admin-own-branch
 * restriction is enforced in createStaffAccount().
 */
export async function createStaffAccountController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;

  if (!requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = createStaffAccountValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const result = await createStaffAccount({
      requesterRole,
      requesterBranchId,
      username: parsed.data.username,
      registeredEmail: parsed.data.registered_email,
      displayName: parsed.data.display_name,
      role: parsed.data.role,
      branchId: parsed.data.branch_id,
    });

    return res.status(201).json({
      staff: result.staff,
      temporary_password: result.temporaryPassword,
    });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/**
 * M01 Process 5: Admin Manages a Staff Account (promote/demote, deactivate,
 * transfer branch). Route-level requireRole restricts this to Admin/
 * Superadmin; the Superadmin-only restriction for role/branch changes is
 * enforced in manageStaffAccount().
 */
export async function manageStaffAccountController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;
  const targetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;

  if (!requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = manageStaffAccountValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const staff = await manageStaffAccount({
      requesterRole,
      requesterBranchId,
      targetStaffId: targetId as string,
      role: parsed.data.role,
      branchId: parsed.data.branch_id,
      isActive: parsed.data.is_active,
    });

    return res.status(200).json({ staff });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/**
 * Issue #74: POST /staff/:id/resend-account-email. Route-level requireRole
 * already restricts this to Admin/Superadmin (AC-3).
 */
export async function resendAccountEmailController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterRole = req.user?.role;
  const targetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;

  if (!requesterRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await resendAccountEmail({ targetStaffId: targetId as string });

    return res.status(200).json({ message: 'Account email resent.' });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function createUnavailabilityBlockController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const targetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;

  if (!requesterId || !requesterRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = createUnavailabilityBlockValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const block = await createUnavailabilityBlock({
      requesterId,
      requesterRole,
      targetStaffId: targetId as string,
      quickAction: parsed.data.quick_action,
      startTime: parsed.data.start_time,
      endTime: parsed.data.end_time,
      reason: parsed.data.reason,
    });

    return res.status(201).json({ block });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function cancelUnavailabilityBlockController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const targetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;
  const blockId = Array.isArray(req.params.blockId)
    ? req.params.blockId[0]
    : req.params.blockId;

  if (!requesterId || !requesterRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await cancelUnavailabilityBlock({
      requesterId,
      requesterRole,
      targetStaffId: targetId as string,
      blockId: blockId as string,
    });

    return res.status(204).send();
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listUnavailabilityBlocksController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const targetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;

  if (!requesterId || !requesterRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const blocks = await listUnavailabilityBlocks({
      requesterId,
      requesterRole,
      targetStaffId: targetId as string,
    });

    return res.status(200).json({ blocks });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function reviewUnavailabilityBlockController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const targetId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;
  const blockId = Array.isArray(req.params.blockId)
    ? req.params.blockId[0]
    : req.params.blockId;

  if (!requesterId || !requesterRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parsed = reviewUnavailabilityBlockValidator.safeParse(req.body);

  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  try {
    const block = await reviewUnavailabilityBlock({
      requesterId,
      requesterRole,
      targetStaffId: targetId as string,
      blockId: blockId as string,
      decision: parsed.data.decision,
      denialReason: parsed.data.denial_reason,
    });

    return res.status(200).json({ block });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listPendingUnavailabilityBlocksController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const requesterRole = req.user?.role;
  const requesterBranchId = req.user?.branch_id;

  if (!requesterId || !requesterRole || !requesterBranchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const blocks = await listPendingUnavailabilityBlocks({
      requesterId,
      requesterRole,
      requesterBranchId,
    });

    return res.status(200).json({ blocks });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
