import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createAnnouncement, createMailThread } from './messaging.service.ts';
import { ANNOUNCEMENT_SENDER_ROLES } from '../../staff/staff.types.ts';
import type {
  MessageDraft,
  MessageThread,
  SaveDraftParams,
} from '../messaging.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function authorColumn(isStaff: boolean): string {
  return isStaff ? 'author_staff_id' : 'author_customer_id';
}

interface AuthorParams {
  authorId: string;
  isStaff: boolean;
}

export async function listDrafts({ authorId, isStaff }: AuthorParams): Promise<MessageDraft[]> {
  const { data, error } = await supabase
    .from('message_drafts')
    .select('*')
    .eq(authorColumn(isStaff), authorId)
    .order('updated_at', { ascending: false });

  if (error) {
    throwWithStatus(400, error.message);
  }

  return (data ?? []) as MessageDraft[];
}

interface DraftIdentity extends AuthorParams {
  draftId: string;
}

/** 404s (not 403) on a draft the requester doesn't own - same "don't leak existence" convention as getThreadDetail. */
export async function getDraft({ draftId, authorId, isStaff }: DraftIdentity): Promise<MessageDraft> {
  const { data, error } = await supabase
    .from('message_drafts')
    .select('*')
    .eq('id', draftId)
    .eq(authorColumn(isStaff), authorId)
    .maybeSingle();

  if (error) {
    throwWithStatus(400, error.message);
  }

  if (!data) {
    throwWithStatus(404, 'Draft not found');
  }

  return data as MessageDraft;
}

export async function createDraft(params: SaveDraftParams): Promise<MessageDraft> {
  const { data, error } = await supabase
    .from('message_drafts')
    .insert({
      author_staff_id: params.authorStaffId ?? null,
      author_customer_id: params.authorCustomerId ?? null,
      message_type: params.messageType,
      subject: params.subject ?? null,
      body: params.body ?? null,
      recipients: params.recipients,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to save draft');
  }

  return data as MessageDraft;
}

interface UpdateDraftParams extends DraftIdentity {
  subject?: string | null;
  body?: string | null;
  recipients?: SaveDraftParams['recipients'];
}

export async function updateDraft(params: UpdateDraftParams): Promise<MessageDraft> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (params.subject !== undefined) updates.subject = params.subject;
  if (params.body !== undefined) updates.body = params.body;
  if (params.recipients !== undefined) updates.recipients = params.recipients;

  const { data, error } = await supabase
    .from('message_drafts')
    .update(updates)
    .eq('id', params.draftId)
    .eq(authorColumn(params.isStaff), params.authorId)
    .select('*')
    .maybeSingle();

  if (error) {
    throwWithStatus(400, error.message);
  }

  if (!data) {
    throwWithStatus(404, 'Draft not found');
  }

  return data as MessageDraft;
}

export async function deleteDraft({ draftId, authorId, isStaff }: DraftIdentity): Promise<void> {
  const { error } = await supabase
    .from('message_drafts')
    .delete()
    .eq('id', draftId)
    .eq(authorColumn(isStaff), authorId);

  if (error) {
    throwWithStatus(400, error.message);
  }
}

interface SendDraftParams extends DraftIdentity {
  senderBranchId: string | null;
  isSuperadmin: boolean;
  /** Only meaningful when isStaff - gates the announcement branch below. */
  staffRole?: string | null;
}

/**
 * Loads the draft (author-scoped, 404 otherwise), reconstructs the right
 * createMailThread/createAnnouncement params from its jsonb recipients
 * blob, sends it, then deletes the draft row - a draft is a staging area,
 * not something that lingers alongside its own sent thread.
 */
export async function sendDraft(params: SendDraftParams): Promise<MessageThread> {
  const draft = await getDraft(params);

  if (!draft.subject?.trim() || !draft.body?.trim()) {
    throwWithStatus(400, 'Subject and body are required to send.');
  }

  let thread: MessageThread;

  if (draft.recipients.type === 'mail') {
    thread = await createMailThread({
      senderStaffId: params.isStaff ? params.authorId : null,
      senderCustomerId: params.isStaff ? null : params.authorId,
      subject: draft.subject,
      body: draft.body,
      recipients: draft.recipients.recipientIds,
    });
  } else {
    if (!params.isStaff || !ANNOUNCEMENT_SENDER_ROLES.includes(params.staffRole ?? '')) {
      throwWithStatus(403, 'Only Supervisor/Admin/Superadmin may send an announcement.');
    }

    thread = await createAnnouncement({
      senderStaffId: params.authorId,
      senderBranchId: params.senderBranchId,
      isSuperadmin: params.isSuperadmin,
      subject: draft.subject,
      body: draft.body,
      targetStaffRoles: draft.recipients.targetStaffRoles,
      includeAllCustomers: draft.recipients.includeAllCustomers,
      excludedStaffIds: draft.recipients.excludedStaffIds,
      excludedCustomerIds: draft.recipients.excludedCustomerIds,
    });
  }

  await deleteDraft(params);

  return thread;
}
