import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import { insertAttachmentsForMessage } from './attachments.service.ts';
import type {
  CreateAnnouncementParams,
  CreateMailThreadParams,
  Message,
  MessageAttachment,
  MessageThread,
  MessageThreadParticipant,
  MessageThreadType,
  PendingAttachment,
  ReplyToThreadParams,
  ThreadDetail,
  ThreadSummary,
} from '../messaging.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface ResolvedRecipient {
  staffId?: string;
  customerId?: string;
}

/**
 * Resolves an announcement's target-role checkboxes + excluded-user list
 * into the concrete set of recipients (never including the sender - the
 * sender is always added as a participant separately in createAnnouncement).
 * Staff targeting is branch-scoped for a Supervisor/Admin sender and global
 * for a Superadmin, matching listStaffController's own branch rule
 * (staff.controller.ts) - customers have no branch_id, so customer
 * targeting is always global.
 */
async function resolveAnnouncementRecipients(
  params: CreateAnnouncementParams
): Promise<ResolvedRecipient[]> {
  const recipients: ResolvedRecipient[] = [];
  const excludedStaffIds = new Set(params.excludedStaffIds ?? []);
  const excludedCustomerIds = new Set(params.excludedCustomerIds ?? []);

  if (params.targetStaffRoles.length > 0) {
    let query = supabase
      .from('staff_profiles')
      .select('id')
      .in('role', params.targetStaffRoles)
      .is('archived_at', null);

    if (!params.isSuperadmin) {
      query = query.eq('branch_id', params.senderBranchId);
    }

    const { data, error } = await query;

    if (error) {
      throwWithStatus(400, error.message);
    }

    for (const row of data ?? []) {
      if (row.id !== params.senderStaffId && !excludedStaffIds.has(row.id)) {
        recipients.push({ staffId: row.id as string });
      }
    }
  }

  if (params.includeAllCustomers) {
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('id')
      .is('archived_at', null);

    if (error) {
      throwWithStatus(400, error.message);
    }

    for (const row of data ?? []) {
      if (!excludedCustomerIds.has(row.id as string)) {
        recipients.push({ customerId: row.id as string });
      }
    }
  }

  return recipients;
}

interface CreateThreadParams {
  threadType: MessageThreadType;
  subject: string;
  body: string;
  creatorStaffId?: string | null;
  creatorCustomerId?: string | null;
  /** Never includes the creator - they're always added as a participant separately. */
  recipients: ResolvedRecipient[];
  attachments?: PendingAttachment[];
}

/**
 * The one path threads get created through - shared by createAnnouncement
 * (Supervisor/Admin/Superadmin, role-targeted) and createMailThread (anyone
 * to anyone, explicit recipients). Creates the thread with every recipient
 * (plus the creator) as a participant, writes the opening body as message
 * #1, then fans out a 'message_received' notification (via the existing
 * createNotification - not duplicated here) to every recipient. A
 * recipient notification's failure is best-effort, same as
 * notifyStaffRoleAtBranch.
 */
async function createThread(params: CreateThreadParams): Promise<MessageThread> {
  if (params.recipients.length === 0) {
    throwWithStatus(400, 'No recipients matched the selected targeting criteria.');
  }

  const { data: thread, error: threadError } = await supabase
    .from('message_threads')
    .insert({
      subject: params.subject,
      thread_type: params.threadType,
      created_by_staff_id: params.creatorStaffId ?? null,
      created_by_customer_id: params.creatorCustomerId ?? null,
    })
    .select('*')
    .maybeSingle();

  if (threadError || !thread) {
    throwWithStatus(400, threadError?.message ?? 'Failed to create thread');
  }

  const participantRows = [
    {
      thread_id: thread.id,
      participant_staff_id: params.creatorStaffId ?? null,
      participant_customer_id: params.creatorCustomerId ?? null,
    },
    ...params.recipients.map((recipient) => ({
      thread_id: thread.id,
      participant_staff_id: recipient.staffId ?? null,
      participant_customer_id: recipient.customerId ?? null,
    })),
  ];

  const { error: participantsError } = await supabase
    .from('message_thread_participants')
    .insert(participantRows);

  if (participantsError) {
    throwWithStatus(400, participantsError.message);
  }

  const { data: message, error: messageError } = await supabase
    .from('messages')
    .insert({
      thread_id: thread.id,
      sender_staff_id: params.creatorStaffId ?? null,
      sender_customer_id: params.creatorCustomerId ?? null,
      body: params.body,
    })
    .select('id')
    .maybeSingle();

  if (messageError || !message) {
    throwWithStatus(400, messageError?.message ?? 'Failed to create message');
  }

  if (params.attachments?.length) {
    await insertAttachmentsForMessage(message.id as string, params.attachments);
  }

  for (const recipient of params.recipients) {
    try {
      await createNotification({
        recipientStaffId: recipient.staffId ?? null,
        recipientCustomerId: recipient.customerId ?? null,
        eventType: 'message_received',
        title: params.subject,
        message: params.body.slice(0, 140),
        relatedThreadId: thread.id as string,
      });
    } catch (notifyError) {
      console.error(`Failed to notify recipient of thread ${thread.id}:`, notifyError);
    }
  }

  return thread as MessageThread;
}

export async function createAnnouncement(
  params: CreateAnnouncementParams
): Promise<MessageThread> {
  const recipients = await resolveAnnouncementRecipients(params);

  return createThread({
    threadType: 'announcement',
    subject: params.subject,
    body: params.body,
    creatorStaffId: params.senderStaffId,
    recipients,
    attachments: params.attachments,
  });
}

/**
 * Mail: anyone (staff or customer) can address a thread to any other
 * individual user(s) in the system, picked via the directory search
 * (directory.service.ts). Self-references (a stray self-add from the
 * picker) are dropped rather than rejected outright.
 */
export async function createMailThread(
  params: CreateMailThreadParams
): Promise<MessageThread> {
  const senderId = params.senderStaffId ?? params.senderCustomerId ?? null;

  const recipients = params.recipients.filter((recipient) => {
    const recipientId = recipient.staffId ?? recipient.customerId;
    return recipientId && recipientId !== senderId;
  });

  return createThread({
    threadType: 'mail',
    subject: params.subject,
    body: params.body,
    creatorStaffId: params.senderStaffId,
    creatorCustomerId: params.senderCustomerId,
    recipients,
    attachments: params.attachments,
  });
}

interface ParticipantIdentity {
  threadId: string;
  userId: string;
  isStaff: boolean;
}

function participantColumn(isStaff: boolean): string {
  return isStaff ? 'participant_staff_id' : 'participant_customer_id';
}

async function getParticipantRow({
  threadId,
  userId,
  isStaff,
}: ParticipantIdentity): Promise<MessageThreadParticipant | null> {
  const { data, error } = await supabase
    .from('message_thread_participants')
    .select('*')
    .eq('thread_id', threadId)
    .eq(participantColumn(isStaff), userId)
    .maybeSingle();

  if (error) {
    throwWithStatus(400, error.message);
  }

  return (data as MessageThreadParticipant) ?? null;
}

export async function isThreadParticipant(
  params: ParticipantIdentity
): Promise<boolean> {
  return (await getParticipantRow(params)) !== null;
}

/**
 * Any existing participant (staff or customer) may reply - the controller
 * has already verified membership via isThreadParticipant before this runs.
 * Bumps the replier's own last_read_at (they've obviously seen up to their
 * own message) and best-effort notifies every *other* participant, reusing
 * createNotification exactly like createThread does.
 */
export async function replyToThread(
  params: ReplyToThreadParams
): Promise<Message> {
  const { data: message, error: messageError } = await supabase
    .from('messages')
    .insert({
      thread_id: params.threadId,
      sender_staff_id: params.senderStaffId ?? null,
      sender_customer_id: params.senderCustomerId ?? null,
      body: params.body,
    })
    .select('*')
    .maybeSingle();

  if (messageError || !message) {
    throwWithStatus(400, messageError?.message ?? 'Failed to send reply');
  }

  const attachments = params.attachments?.length
    ? await insertAttachmentsForMessage(message.id as string, params.attachments)
    : [];

  const senderId = params.senderStaffId ?? params.senderCustomerId ?? '';
  const senderIsStaff = Boolean(params.senderStaffId);

  await supabase
    .from('message_thread_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('thread_id', params.threadId)
    .eq(participantColumn(senderIsStaff), senderId);

  const { data: thread } = await supabase
    .from('message_threads')
    .select('subject')
    .eq('id', params.threadId)
    .maybeSingle();

  const { data: participants } = await supabase
    .from('message_thread_participants')
    .select('*')
    .eq('thread_id', params.threadId);

  const isSender = (participant: MessageThreadParticipant) =>
    (senderIsStaff &&
      participant.participant_staff_id === params.senderStaffId) ||
    (!senderIsStaff &&
      participant.participant_customer_id === params.senderCustomerId);

  const otherParticipants = (
    (participants ?? []) as MessageThreadParticipant[]
  ).filter((participant) => !isSender(participant));

  for (const participant of otherParticipants) {
    try {
      await createNotification({
        recipientStaffId: participant.participant_staff_id,
        recipientCustomerId: participant.participant_customer_id,
        eventType: 'message_received',
        title: `New reply: ${thread?.subject ?? 'Message'}`,
        message: params.body.slice(0, 140),
        relatedThreadId: params.threadId,
      });
    } catch (notifyError) {
      console.error(
        `Failed to notify participant of reply in thread ${params.threadId}:`,
        notifyError
      );
    }
  }

  return { ...(message as Message), attachments };
}

/**
 * Batch-resolves display names for a set of messages' senders (one query
 * per side, not one per row) - powers ThreadSummary.lastSenderLabel.
 */
async function resolveSenderLabels(
  messages: Message[]
): Promise<Map<string, string>> {
  const staffIds = [
    ...new Set(messages.map((m) => m.sender_staff_id).filter((id): id is string => Boolean(id))),
  ];
  const customerIds = [
    ...new Set(
      messages.map((m) => m.sender_customer_id).filter((id): id is string => Boolean(id))
    ),
  ];

  const [{ data: staff }, { data: customers }] = await Promise.all([
    staffIds.length > 0
      ? supabase.from('staff_profiles').select('id, display_name').in('id', staffIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    customerIds.length > 0
      ? supabase.from('customer_profiles').select('id, full_name').in('id', customerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);

  const labelById = new Map<string, string>();
  for (const row of staff ?? []) {
    labelById.set(row.id, row.display_name);
  }
  for (const row of customers ?? []) {
    labelById.set(row.id, row.full_name);
  }

  const labelByMessageId = new Map<string, string>();
  for (const message of messages) {
    const senderId = message.sender_staff_id ?? message.sender_customer_id;
    labelByMessageId.set(message.id, (senderId && labelById.get(senderId)) || 'Unknown');
  }

  return labelByMessageId;
}

interface RecipientInboxParams {
  recipientId: string;
  isStaff: boolean;
}

export async function getThreadsForRecipient({
  recipientId,
  isStaff,
}: RecipientInboxParams): Promise<ThreadSummary[]> {
  const { data: ownParticipantRows, error: participantsError } = await supabase
    .from('message_thread_participants')
    .select('thread_id, last_read_at, is_starred')
    .eq(participantColumn(isStaff), recipientId)
    .eq('is_deleted', false);

  if (participantsError) {
    throwWithStatus(400, participantsError.message);
  }

  const threadIds = (ownParticipantRows ?? []).map((row) => row.thread_id);

  if (threadIds.length === 0) {
    return [];
  }

  const ownParticipantByThreadId = new Map(
    (ownParticipantRows ?? []).map((row) => [row.thread_id, row])
  );

  const [{ data: threads, error: threadsError }, { data: messages }] = await Promise.all([
    supabase.from('message_threads').select('*').in('id', threadIds),
    supabase
      .from('messages')
      .select('*')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false }),
  ]);

  if (threadsError) {
    throwWithStatus(400, threadsError.message);
  }

  const latestMessageByThreadId = new Map<string, Message>();
  for (const message of (messages ?? []) as Message[]) {
    if (!latestMessageByThreadId.has(message.thread_id)) {
      latestMessageByThreadId.set(message.thread_id, message);
    }
  }

  const senderLabelByMessageId = await resolveSenderLabels([
    ...latestMessageByThreadId.values(),
  ]);

  const summaries: ThreadSummary[] = ((threads ?? []) as MessageThread[]).map((thread) => {
    const latestMessage = latestMessageByThreadId.get(thread.id);
    const ownParticipant = ownParticipantByThreadId.get(thread.id);
    const lastReadAt = ownParticipant?.last_read_at as string | null;
    const isOwn = isStaff
      ? thread.created_by_staff_id === recipientId
      : thread.created_by_customer_id === recipientId;

    return {
      ...thread,
      lastMessageAt: latestMessage?.created_at ?? thread.created_at,
      lastMessagePreview: latestMessage?.body ?? '',
      lastSenderLabel: latestMessage
        ? (senderLabelByMessageId.get(latestMessage.id) ?? 'Unknown')
        : 'Unknown',
      unread: lastReadAt
        ? (latestMessage?.created_at ?? thread.created_at) > lastReadAt
        : true,
      isStarred: Boolean(ownParticipant?.is_starred),
      isOwn,
    };
  });

  return summaries.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
}

interface ThreadDetailParams {
  threadId: string;
  requesterId: string;
  isStaff: boolean;
}

/**
 * 404s (not 403) when the requester has no participant row for this thread,
 * matching notifications' markRead convention of not leaking existence to
 * non-owners. Deliberately doesn't check is_deleted - deleting only hides a
 * thread from list views, it doesn't revoke access to a direct link.
 */
export async function getThreadDetail({
  threadId,
  requesterId,
  isStaff,
}: ThreadDetailParams): Promise<ThreadDetail> {
  const ownParticipant = await getParticipantRow({
    threadId,
    userId: requesterId,
    isStaff,
  });

  if (!ownParticipant) {
    throwWithStatus(404, 'Thread not found');
  }

  const [{ data: thread }, { data: participants }, { data: messages }] = await Promise.all([
    supabase.from('message_threads').select('*').eq('id', threadId).single(),
    supabase.from('message_thread_participants').select('*').eq('thread_id', threadId),
    supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true }),
  ]);

  const messageIds = (messages ?? []).map((message) => message.id as string);
  const { data: attachments } =
    messageIds.length > 0
      ? await supabase.from('message_attachments').select('*').in('message_id', messageIds)
      : { data: [] as MessageAttachment[] };

  const attachmentsByMessageId = new Map<string, MessageAttachment[]>();
  for (const attachment of (attachments ?? []) as MessageAttachment[]) {
    const existing = attachmentsByMessageId.get(attachment.message_id) ?? [];
    existing.push(attachment);
    attachmentsByMessageId.set(attachment.message_id, existing);
  }

  return {
    ...(thread as MessageThread),
    participants: (participants ?? []) as MessageThreadParticipant[],
    messages: ((messages ?? []) as Message[]).map((message) => ({
      ...message,
      attachments: attachmentsByMessageId.get(message.id) ?? [],
    })),
  };
}

interface SetThreadReadStateParams extends ThreadDetailParams {
  /** Defaults true - pass false for an explicit "mark as unread". */
  read?: boolean;
}

/**
 * Marks (or unmarks) the requester's own participant row read, and syncs
 * any matching 'message_received' notification row tied to this thread -
 * so the bell badge and the thread's own unread state can never drift
 * depending on which UI (bell dropdown vs. the Messages page) the user
 * changed it from.
 */
export async function setThreadReadState({
  threadId,
  requesterId,
  isStaff,
  read = true,
}: SetThreadReadStateParams): Promise<void> {
  const recipientColumn = isStaff ? 'recipient_staff_id' : 'recipient_customer_id';

  const [participantsResult, notificationsResult] = await Promise.all([
    supabase
      .from('message_thread_participants')
      .update({ last_read_at: read ? new Date().toISOString() : null })
      .eq('thread_id', threadId)
      .eq(participantColumn(isStaff), requesterId),
    supabase
      .from('notifications')
      .update({ is_read: read })
      .eq('related_thread_id', threadId)
      .eq(recipientColumn, requesterId),
  ]);

  if (participantsResult.error) {
    throwWithStatus(400, participantsResult.error.message);
  }

  if (notificationsResult.error) {
    throwWithStatus(400, notificationsResult.error.message);
  }
}

interface SetThreadStarredParams extends ThreadDetailParams {
  starred: boolean;
}

export async function setThreadStarred({
  threadId,
  requesterId,
  isStaff,
  starred,
}: SetThreadStarredParams): Promise<void> {
  const { error } = await supabase
    .from('message_thread_participants')
    .update({ is_starred: starred })
    .eq('thread_id', threadId)
    .eq(participantColumn(isStaff), requesterId);

  if (error) {
    throwWithStatus(400, error.message);
  }
}

/**
 * One-way/soft: hides the thread from this participant's own list views
 * going forward (getThreadsForRecipient filters is_deleted=false). Every
 * other participant's view is unaffected. No restore UI in this pass.
 */
export async function setThreadDeleted({
  threadId,
  requesterId,
  isStaff,
}: ThreadDetailParams): Promise<void> {
  const { error } = await supabase
    .from('message_thread_participants')
    .update({ is_deleted: true })
    .eq('thread_id', threadId)
    .eq(participantColumn(isStaff), requesterId);

  if (error) {
    throwWithStatus(400, error.message);
  }
}
