import type { StaffRole } from '../staff/staff.types.ts';

export type MessageThreadType = 'mail' | 'announcement';

export interface MessageThread {
  id: string;
  subject: string;
  thread_type: MessageThreadType;
  created_by_staff_id: string | null;
  created_by_customer_id: string | null;
  created_at: string;
}

export interface MessageThreadParticipant {
  id: string;
  thread_id: string;
  participant_staff_id: string | null;
  participant_customer_id: string | null;
  last_read_at: string | null;
  is_starred: boolean;
  is_deleted: boolean;
  created_at: string;
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

/** Descriptor for an already-uploaded file (POST /messages/attachments), before it's linked to a message. */
export interface PendingAttachment {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_staff_id: string | null;
  sender_customer_id: string | null;
  body: string;
  created_at: string;
  attachments: MessageAttachment[];
}

export interface ThreadSummary extends MessageThread {
  lastMessageAt: string;
  lastMessagePreview: string;
  /** Display name of whoever sent the latest message - the merged Inbox's "From" column. */
  lastSenderLabel: string;
  unread: boolean;
  isStarred: boolean;
  /** True when the viewer is this thread's creator - drives the Sent folder. */
  isOwn: boolean;
}

export interface ThreadDetail extends MessageThread {
  participants: MessageThreadParticipant[];
  messages: Message[];
}

interface ResolvedRecipientRef {
  staffId?: string;
  customerId?: string;
}

/**
 * Threads are created two ways: an Announcement (Supervisor/Admin/
 * Superadmin, role-targeted - see ANNOUNCEMENT_SENDER_ROLES in
 * staff.types.ts) or Mail (anyone to anyone, explicit recipients). Both
 * funnel through the shared createThread() helper in messaging.service.ts.
 */
export interface CreateAnnouncementParams {
  senderStaffId: string;
  /** null for a Superadmin sender (targeting resolves globally). */
  senderBranchId: string | null;
  isSuperadmin: boolean;
  subject: string;
  body: string;
  /** The per-staff-role checkboxes. */
  targetStaffRoles: StaffRole[];
  /** The "Customer" checkbox. */
  includeAllCustomers: boolean;
  excludedStaffIds?: string[];
  excludedCustomerIds?: string[];
  attachments?: PendingAttachment[];
}

export interface CreateMailThreadParams {
  senderStaffId?: string | null;
  senderCustomerId?: string | null;
  subject: string;
  body: string;
  recipients: ResolvedRecipientRef[];
  attachments?: PendingAttachment[];
}

export interface ReplyToThreadParams {
  threadId: string;
  senderStaffId?: string | null;
  senderCustomerId?: string | null;
  body: string;
  attachments?: PendingAttachment[];
}

export interface DirectoryEntry {
  id: string;
  kind: 'staff' | 'customer';
  displayName: string;
  role?: StaffRole;
}

export type DraftRecipients =
  | {
      type: 'mail';
      recipientIds: ResolvedRecipientRef[];
    }
  | {
      type: 'announcement';
      targetStaffRoles: StaffRole[];
      includeAllCustomers: boolean;
      excludedStaffIds: string[];
      excludedCustomerIds: string[];
    };

export interface MessageDraft {
  id: string;
  author_staff_id: string | null;
  author_customer_id: string | null;
  message_type: MessageThreadType;
  subject: string | null;
  body: string | null;
  recipients: DraftRecipients;
  created_at: string;
  updated_at: string;
}

export interface SaveDraftParams {
  authorStaffId?: string | null;
  authorCustomerId?: string | null;
  messageType: MessageThreadType;
  subject?: string | null;
  body?: string | null;
  recipients: DraftRecipients;
}
