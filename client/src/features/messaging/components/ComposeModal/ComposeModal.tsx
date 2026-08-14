import { useState } from 'react';
import { createDraft } from '../../api/messaging.api';
import type { DraftRecipients, MessageThread, MessageThreadType } from '../../messaging.types';
import { MailComposer } from '../MailComposer/MailComposer';
import { AnnouncementComposer } from '../AnnouncementComposer/AnnouncementComposer';
import styles from './ComposeModal.module.css';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string;
  /** Staff role, or null for a customer - gates whether the Announcement tab renders at all. */
  viewerRole: string | null;
  onSent: (thread: MessageThread) => void;
  onDraftSaved: () => void;
}

/**
 * Mirrors ANNOUNCEMENT_SENDER_ROLES (server staff.types.ts) as a local
 * literal, matching this codebase's own convention (AnnouncementComposer's
 * own ALL_STAFF_ROLES is likewise a local literal, not a shared export).
 */
const ANNOUNCEMENT_SENDER_ROLES = ['Supervisor', 'Admin', 'Superadmin'];

/**
 * The single compose entry point - launched from the navbar's mail icon
 * (ComposeEntryPoint). Type toggle between Mail (anyone to anyone) and
 * Announcement (Supervisor/Admin/Superadmin only, role-targeted) - the
 * Announcement tab simply isn't rendered for a viewer who isn't allowed to
 * send one.
 */
export function ComposeModal({
  isOpen,
  onClose,
  accessToken,
  viewerRole,
  onSent,
  onDraftSaved,
}: ComposeModalProps) {
  const canSendAnnouncement =
    viewerRole !== null && ANNOUNCEMENT_SENDER_ROLES.includes(viewerRole);
  const [messageType, setMessageType] = useState<MessageThreadType>('mail');
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  if (!isOpen) {
    return null;
  }

  async function handleSaveDraft(fields: {
    subject: string;
    body: string;
    recipients: DraftRecipients;
  }) {
    setIsSavingDraft(true);
    await createDraft(
      {
        messageType,
        subject: fields.subject,
        body: fields.body,
        recipients: fields.recipients,
      },
      accessToken
    );
    setIsSavingDraft(false);
    onDraftSaved();
    onClose();
  }

  function handleCreated(thread: MessageThread) {
    onSent(thread);
    onClose();
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compose-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="compose-modal-title" className={styles.title}>
            New message
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {canSendAnnouncement ? (
          <div className={styles.typeTabs} role="tablist" aria-label="Message type">
            <button
              type="button"
              role="tab"
              aria-selected={messageType === 'mail'}
              className={messageType === 'mail' ? styles.typeTabActive : styles.typeTab}
              onClick={() => setMessageType('mail')}
            >
              Mail
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={messageType === 'announcement'}
              className={
                messageType === 'announcement' ? styles.typeTabActive : styles.typeTab
              }
              onClick={() => setMessageType('announcement')}
            >
              Announcement
            </button>
          </div>
        ) : null}

        {messageType === 'mail' ? (
          <MailComposer
            accessToken={accessToken}
            onCreated={handleCreated}
            onSaveDraft={(fields) => void handleSaveDraft(fields)}
            isSavingDraft={isSavingDraft}
          />
        ) : (
          <AnnouncementComposer
            accessToken={accessToken}
            onCreated={handleCreated}
            onSaveDraft={(fields) => void handleSaveDraft(fields)}
            isSavingDraft={isSavingDraft}
          />
        )}
      </section>
    </div>
  );
}
