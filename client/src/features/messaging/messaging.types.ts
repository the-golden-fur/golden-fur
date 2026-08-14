/** Client mirror of the server's messaging.types.ts. */
import type { StaffRole } from '../staff/staff.types';

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
  lastSenderLabel: string;
  unread: boolean;
  isStarred: boolean;
  isOwn: boolean;
}

export interface ThreadDetail extends MessageThread {
  participants: MessageThreadParticipant[];
  messages: Message[];
}

interface RecipientRef {
  staffId?: string;
  customerId?: string;
}

export interface CreateAnnouncementParams {
  subject: string;
  body: string;
  targetStaffRoles: StaffRole[];
  includeAllCustomers: boolean;
  excludedStaffIds?: string[];
  excludedCustomerIds?: string[];
  attachments?: PendingAttachment[];
}

export interface CreateMailThreadParams {
  subject: string;
  body: string;
  recipients: RecipientRef[];
  attachments?: PendingAttachment[];
}

export interface DirectoryEntry {
  id: string;
  kind: 'staff' | 'customer';
  displayName: string;
  role?: StaffRole;
}

export type DraftRecipients =
  | { type: 'mail'; recipientIds: RecipientRef[] }
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
  messageType: MessageThreadType;
  subject?: string | null;
  body?: string | null;
  recipients: DraftRecipients;
}
