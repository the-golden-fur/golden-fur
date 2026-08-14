import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import type { PendingAttachment, ThreadDetail as ThreadDetailType } from '../../messaging.types';
import { AttachmentPicker } from '../AttachmentPicker/AttachmentPicker';
import styles from './ThreadDetail.module.css';

interface ThreadDetailProps {
  thread: ThreadDetailType | null;
  isLoading: boolean;
  error: string | null;
  /** The caller's own staff/customer id - distinguishes "sent by me" bubbles. */
  viewerId: string;
  accessToken: string;
  isSending: boolean;
  onReply: (body: string, attachments?: PendingAttachment[]) => void | Promise<void>;
}

function formatTimestamp(createdAt: string): string {
  return new Date(createdAt).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Detail pane of the Messages tab's master-detail layout: the full message
 * history for one thread plus a reply box every participant (not just the
 * Admin/Superadmin who started it) can use.
 */
export function ThreadDetail({
  thread,
  isLoading,
  error,
  viewerId,
  accessToken,
  isSending,
  onReply,
}: ThreadDetailProps) {
  const [draft, setDraft] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<PendingAttachment[]>([]);

  if (isLoading) {
    return <p className={styles.copy}>Loading thread...</p>;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  if (!thread) {
    return (
      <p className={styles.copy}>Select a message to read it here.</p>
    );
  }

  const handleSend = () => {
    const body = draft.trim();

    if (!body && replyAttachments.length === 0) {
      return;
    }

    setDraft('');
    setReplyAttachments([]);
    void onReply(body, replyAttachments);
  };

  return (
    <div className={styles.panel}>
      <h2 className={styles.subject}>{thread.subject}</h2>

      <ul className={styles.messages}>
        {thread.messages.map((message) => {
          const senderId = message.sender_staff_id ?? message.sender_customer_id;
          const isMine = senderId === viewerId;

          return (
            <li
              key={message.id}
              className={isMine ? styles.bubbleMine : styles.bubble}
            >
              <p className={styles.body}>{message.body}</p>
              {message.attachments.length > 0 ? (
                <ul className={styles.attachmentList}>
                  {message.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a
                        href={attachment.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.attachmentLink}
                      >
                        <Paperclip size={12} aria-hidden="true" />
                        {attachment.file_name}
                        <span className={styles.attachmentSize}>
                          {formatFileSize(attachment.file_size)}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
              <span className={styles.timestamp}>
                {formatTimestamp(message.created_at)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className={styles.replyBox}>
        <div className={styles.replyRow}>
          <textarea
            className={styles.replyInput}
            value={draft}
            placeholder="Write a reply..."
            rows={2}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="button"
            className={styles.sendButton}
            disabled={isSending || (!draft.trim() && replyAttachments.length === 0)}
            onClick={handleSend}
          >
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </div>
        <AttachmentPicker
          accessToken={accessToken}
          attachments={replyAttachments}
          onChange={setReplyAttachments}
        />
      </div>
    </div>
  );
}
