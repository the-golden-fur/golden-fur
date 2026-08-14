import type { NextFunction, Response } from 'express';
import multer from 'multer';
import type { AuthenticatedRequest } from '../../shared/shared.types.ts';
import {
  getStaffBranch,
  getStaffRoleOrNull,
} from '../../shared/auth/api/supabaseAuth.api.ts';
import type { StaffRole } from '../staff/staff.types.ts';
import {
  createAnnouncement,
  createMailThread,
  getThreadDetail,
  getThreadsForRecipient,
  isThreadParticipant,
  replyToThread,
  setThreadDeleted,
  setThreadReadState,
  setThreadStarred,
} from './services/messaging.service.ts';
import { searchMessagingDirectory } from './services/directory.service.ts';
import {
  createDraft,
  deleteDraft,
  getDraft,
  listDrafts,
  sendDraft,
  updateDraft,
} from './services/drafts.service.ts';
import { uploadAttachment } from './services/attachments.service.ts';
import type { DraftRecipients, PendingAttachment } from './messaging.types.ts';

function paramId(req: AuthenticatedRequest, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : (value as string);
}

function sendServiceError(res: Response, error: unknown) {
  const statusCode =
    (error as Error & { statusCode?: number }).statusCode ?? 500;
  const message =
    statusCode === 500
      ? 'Internal server error'
      : ((error as Error).message ?? 'Request failed');

  return res.status(statusCode).json({ error: message });
}

/**
 * Same customer-or-staff shared-route pattern as notifications.controller.ts
 * - ownership/membership is resolved here via getStaffRoleOrNull rather than
 * gated by requireRole, since both staff and customer participants read/
 * reply to their own threads through these same routes.
 */
export async function listThreadsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const threads = await getThreadsForRecipient({
      recipientId: requesterId,
      isStaff: Boolean(staffRole),
    });

    return res.status(200).json({ threads });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getThreadDetailController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const thread = await getThreadDetail({
      threadId: paramId(req, 'id'),
      requesterId,
      isStaff: Boolean(staffRole),
    });

    return res.status(200).json({ thread });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function replyToThreadController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const { body, attachments } = req.body as {
    body?: string;
    attachments?: PendingAttachment[];
  };

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'A message body is required' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const isStaff = Boolean(staffRole);
    const threadId = paramId(req, 'id');

    const isMember = await isThreadParticipant({
      threadId,
      userId: requesterId,
      isStaff,
    });

    if (!isMember) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const message = await replyToThread({
      threadId,
      senderStaffId: isStaff ? requesterId : null,
      senderCustomerId: isStaff ? null : requesterId,
      body,
      attachments,
    });

    return res.status(201).json({ message });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

/** Mirrors staff.controller.ts's handleAvatarUploadError - same multer error shape. */
export function handleAttachmentUploadError(
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

/**
 * POST /messages/attachments - any authenticated user (staff or customer)
 * may upload a file, getting back a plain descriptor (no message_attachments
 * row yet - see attachments.service.ts). The client holds these descriptors
 * client-side and sends them along with the actual send/reply request,
 * which is what links them to a real message row.
 */
export async function uploadMessageAttachmentController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const file = req.file as
    | { buffer: Buffer; mimetype: string; originalname: string; size: number }
    | undefined;

  if (!file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  try {
    const attachment = await uploadAttachment({
      uploaderId: requesterId,
      file,
    });
    return res.status(201).json({ attachment });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function markThreadReadController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const body = req.body as { read?: boolean };
    await setThreadReadState({
      threadId: paramId(req, 'id'),
      requesterId,
      isStaff: Boolean(staffRole),
      read: body?.read,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function starThreadController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;
  const starred = (req.body as { starred?: boolean })?.starred;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (typeof starred !== 'boolean') {
    return res.status(400).json({ error: 'starred must be a boolean' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    await setThreadStarred({
      threadId: paramId(req, 'id'),
      requesterId,
      isStaff: Boolean(staffRole),
      starred,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deleteThreadController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    await setThreadDeleted({
      threadId: paramId(req, 'id'),
      requesterId,
      isStaff: Boolean(staffRole),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

interface CreateAnnouncementBody {
  subject?: string;
  body?: string;
  targetStaffRoles?: StaffRole[];
  includeAllCustomers?: boolean;
  excludedStaffIds?: string[];
  excludedCustomerIds?: string[];
  attachments?: PendingAttachment[];
}

/**
 * requireRole([...ANNOUNCEMENT_SENDER_ROLES]) + requireBranch have already
 * run (see messaging.routes.ts), populating req.user.role/branch_id the
 * same way listStaffController relies on them.
 */
export async function createAnnouncementController(
  req: AuthenticatedRequest,
  res: Response
) {
  const senderStaffId = req.user?.sub;
  const role = req.user?.role;
  const branchId = req.user?.branch_id;

  if (!senderStaffId || !role || !branchId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    subject,
    body,
    targetStaffRoles,
    includeAllCustomers,
    excludedStaffIds,
    excludedCustomerIds,
    attachments,
  } = req.body as CreateAnnouncementBody;

  if (!subject?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'Subject and body are required' });
  }

  if (!targetStaffRoles?.length && !includeAllCustomers) {
    return res
      .status(400)
      .json({ error: 'At least one recipient role must be selected' });
  }

  try {
    const isSuperadmin = role === 'Superadmin';
    const thread = await createAnnouncement({
      senderStaffId,
      senderBranchId: isSuperadmin ? null : branchId,
      isSuperadmin,
      subject,
      body,
      targetStaffRoles: targetStaffRoles ?? [],
      includeAllCustomers: Boolean(includeAllCustomers),
      excludedStaffIds,
      excludedCustomerIds,
      attachments,
    });

    return res.status(201).json({ thread });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

interface CreateMailBody {
  subject?: string;
  body?: string;
  recipients?: { staffId?: string; customerId?: string }[];
  attachments?: PendingAttachment[];
}

/**
 * Mail: any authenticated user (staff or customer) may address a thread to
 * any other individual user(s) - no requireRole gate, matching the
 * "anyone to anyone" scope confirmed for this feature.
 */
export async function createMailThreadController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { subject, body, recipients, attachments } = req.body as CreateMailBody;

  if (!subject?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'Subject and body are required' });
  }

  if (!recipients?.length) {
    return res
      .status(400)
      .json({ error: 'At least one recipient is required' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const isStaff = Boolean(staffRole);
    const thread = await createMailThread({
      senderStaffId: isStaff ? requesterId : null,
      senderCustomerId: isStaff ? null : requesterId,
      subject,
      attachments,
      body,
      recipients,
    });

    return res.status(201).json({ thread });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listMessagingDirectoryController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const query = typeof req.query.q === 'string' ? req.query.q : '';

  try {
    const entries = await searchMessagingDirectory({
      query,
      excludeUserId: requesterId,
    });

    return res.status(200).json({ entries });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function listDraftsController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const drafts = await listDrafts({
      authorId: requesterId,
      isStaff: Boolean(staffRole),
    });

    return res.status(200).json({ drafts });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function getDraftController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const draft = await getDraft({
      draftId: paramId(req, 'id'),
      authorId: requesterId,
      isStaff: Boolean(staffRole),
    });

    return res.status(200).json({ draft });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

interface DraftBody {
  messageType?: 'mail' | 'announcement';
  subject?: string | null;
  body?: string | null;
  recipients?: DraftRecipients;
}

export async function createDraftController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { messageType, subject, body, recipients } = req.body as DraftBody;

  if (!messageType || !recipients) {
    return res
      .status(400)
      .json({ error: 'messageType and recipients are required' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const isStaff = Boolean(staffRole);
    const draft = await createDraft({
      authorStaffId: isStaff ? requesterId : null,
      authorCustomerId: isStaff ? null : requesterId,
      messageType,
      subject,
      body,
      recipients,
    });

    return res.status(201).json({ draft });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function updateDraftController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { subject, body, recipients } = req.body as DraftBody;

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const draft = await updateDraft({
      draftId: paramId(req, 'id'),
      authorId: requesterId,
      isStaff: Boolean(staffRole),
      subject,
      body,
      recipients,
    });

    return res.status(200).json({ draft });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function deleteDraftController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    await deleteDraft({
      draftId: paramId(req, 'id'),
      authorId: requesterId,
      isStaff: Boolean(staffRole),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return sendServiceError(res, error);
  }
}

export async function sendDraftController(
  req: AuthenticatedRequest,
  res: Response
) {
  const requesterId = req.user?.sub;

  if (!requesterId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const staffRole = await getStaffRoleOrNull(requesterId);
    const isStaff = Boolean(staffRole);
    const isSuperadmin = staffRole === 'Superadmin';

    // This shared route only runs jwtMiddleware (customers hit it too), so
    // req.user.branch_id is never populated by requireBranch here - resolve
    // it directly, same source getStaffBranch/requireBranch itself reads.
    let senderBranchId: string | null = null;
    if (isStaff && !isSuperadmin) {
      const { data } = await getStaffBranch(requesterId);
      senderBranchId = data?.branch_id ?? null;
    }

    const thread = await sendDraft({
      draftId: paramId(req, 'id'),
      authorId: requesterId,
      isStaff,
      senderBranchId,
      isSuperadmin,
      staffRole,
    });

    return res.status(201).json({ thread });
  } catch (error) {
    return sendServiceError(res, error);
  }
}
