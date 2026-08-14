import { useState } from 'react';
import { createMailThread } from '../../api/messaging.api';
import { RecipientPicker } from '../RecipientPicker/RecipientPicker';
import { AttachmentPicker } from '../AttachmentPicker/AttachmentPicker';
import type {
  DirectoryEntry,
  DraftRecipients,
  MessageThread,
  PendingAttachment,
} from '../../messaging.types';
import styles from './MailComposer.module.css';

interface MailComposerProps {
  accessToken: string;
  onCreated: (thread: MessageThread) => void;
  onSaveDraft?: (fields: {
    subject: string;
    body: string;
    recipients: DraftRecipients;
  }) => void;
  isSavingDraft?: boolean;
}

/**
 * Anyone-to-anyone Mail compose form for ComposeModal - any staff member or
 * customer can address a thread to any other individual user(s), picked via
 * RecipientPicker (GET /messages/directory).
 */
export function MailComposer({
  accessToken,
  onCreated,
  onSaveDraft,
  isSavingDraft,
}: MailComposerProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState<DirectoryEntry[]>([]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and message are required.');
      return;
    }

    if (recipients.length === 0) {
      setError('Add at least one recipient.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await createMailThread(
      {
        subject: subject.trim(),
        body: body.trim(),
        recipients: recipients.map((entry) =>
          entry.kind === 'staff'
            ? { staffId: entry.id }
            : { customerId: entry.id }
        ),
        attachments,
      },
      accessToken
    );

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to send message.');
      return;
    }

    onCreated(result.data);
  }

  function handleSaveDraft() {
    onSaveDraft?.({
      subject,
      body,
      recipients: {
        type: 'mail',
        recipientIds: recipients.map((entry) =>
          entry.kind === 'staff'
            ? { staffId: entry.id }
            : { customerId: entry.id }
        ),
      },
    });
  }

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="mail-subject">
          Subject
        </label>
        <input
          id="mail-subject"
          className={styles.input}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>To</span>
        <RecipientPicker
          accessToken={accessToken}
          selected={recipients}
          onChange={setRecipients}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="mail-body">
          Message
        </label>
        <textarea
          id="mail-body"
          className={styles.textarea}
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>

      <AttachmentPicker
        accessToken={accessToken}
        attachments={attachments}
        onChange={setAttachments}
      />

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        {onSaveDraft ? (
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={isSavingDraft}
            onClick={handleSaveDraft}
          >
            {isSavingDraft ? 'Saving...' : 'Save draft'}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.button}
          disabled={isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
