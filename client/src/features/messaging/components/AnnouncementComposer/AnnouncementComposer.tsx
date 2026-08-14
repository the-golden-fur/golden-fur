import { useEffect, useMemo, useState } from 'react';
import { listStaff } from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import { listCustomers } from '../../../customers/api/customer.api';
import type { CustomerProfile } from '../../../customers/customer.types';
import { createAnnouncement } from '../../api/messaging.api';
import type {
  DraftRecipients,
  MessageThread,
  PendingAttachment,
} from '../../messaging.types';
import { ExcludeListPanel } from './ExcludeListPanel';
import { AttachmentPicker } from '../AttachmentPicker/AttachmentPicker';
import styles from './AnnouncementComposer.module.css';

interface AnnouncementComposerProps {
  accessToken: string;
  onCreated: (thread: MessageThread) => void;
  /** Composes a DraftRecipients blob from current form state and hands it up to ComposeModal to persist. */
  onSaveDraft?: (fields: {
    subject: string;
    body: string;
    recipients: DraftRecipients;
  }) => void;
  isSavingDraft?: boolean;
}

const ALL_STAFF_ROLES: StaffRole[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
];

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);

  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }

  return next;
}

/**
 * Admin/Superadmin-only compose form for AnnouncementComposerPage. Targets
 * recipients by role checkbox (a "Customer" checkbox plus one per staff
 * role) with an excluded-user picker on top, scoped to only the people who
 * currently match a checked target - reuses the existing listStaff/
 * listCustomers endpoints rather than a dedicated directory endpoint.
 */
export function AnnouncementComposer({
  accessToken,
  onCreated,
  onSaveDraft,
  isSavingDraft,
}: AnnouncementComposerProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [targetRoles, setTargetRoles] = useState<Set<StaffRole>>(new Set());
  const [includeAllCustomers, setIncludeAllCustomers] = useState(false);
  const [excludedStaffIds, setExcludedStaffIds] = useState<Set<string>>(
    new Set()
  );
  const [excludedCustomerIds, setExcludedCustomerIds] = useState<Set<string>>(
    new Set()
  );
  const [staffDirectory, setStaffDirectory] = useState<StaffProfile[]>([]);
  const [customerDirectory, setCustomerDirectory] = useState<CustomerProfile[]>(
    []
  );
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listStaff(accessToken).then((result) => {
      if (result.data) setStaffDirectory(result.data);
    });
    void listCustomers(accessToken).then((result) => {
      if (result.data) setCustomerDirectory(result.data);
    });
  }, [accessToken]);

  const eligibleStaffForExclusion = useMemo(
    () => staffDirectory.filter((staff) => targetRoles.has(staff.role)),
    [staffDirectory, targetRoles]
  );

  async function handleSubmit() {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and message are required.');
      return;
    }

    if (targetRoles.size === 0 && !includeAllCustomers) {
      setError('Select at least one recipient role.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await createAnnouncement(
      {
        subject: subject.trim(),
        body: body.trim(),
        targetStaffRoles: [...targetRoles],
        includeAllCustomers,
        excludedStaffIds: [...excludedStaffIds],
        excludedCustomerIds: [...excludedCustomerIds],
        attachments,
      },
      accessToken
    );

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to send announcement.');
      return;
    }

    onCreated(result.data);
  }

  function handleSaveDraft() {
    onSaveDraft?.({
      subject,
      body,
      recipients: {
        type: 'announcement',
        targetStaffRoles: [...targetRoles],
        includeAllCustomers,
        excludedStaffIds: [...excludedStaffIds],
        excludedCustomerIds: [...excludedCustomerIds],
      },
    });
  }

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="announcement-subject">
          Subject
        </label>
        <input
          id="announcement-subject"
          className={styles.input}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="announcement-body">
          Message
        </label>
        <textarea
          id="announcement-body"
          className={styles.textarea}
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Recipients</span>
        <div className={styles.checkboxGrid}>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={includeAllCustomers}
              onChange={() => setIncludeAllCustomers((value) => !value)}
            />
            Customers
          </label>
          {ALL_STAFF_ROLES.map((role) => (
            <label key={role} className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={targetRoles.has(role)}
                onChange={() =>
                  setTargetRoles((current) => toggle(current, role))
                }
              />
              {role}
            </label>
          ))}
        </div>
      </div>

      {targetRoles.size > 0 ? (
        <ExcludeListPanel
          title="Exclude staff"
          items={eligibleStaffForExclusion}
          getId={(staff) => staff.id}
          getLabel={(staff) => staff.display_name}
          getRole={(staff) => staff.role}
          excludedIds={excludedStaffIds}
          onToggle={(id) =>
            setExcludedStaffIds((current) => toggle(current, id))
          }
          emptyMessage="No staff match the selected roles."
        />
      ) : null}

      {includeAllCustomers ? (
        <ExcludeListPanel
          title="Exclude customers"
          items={customerDirectory}
          getId={(customer) => customer.id}
          getLabel={(customer) => customer.full_name}
          excludedIds={excludedCustomerIds}
          onToggle={(id) =>
            setExcludedCustomerIds((current) => toggle(current, id))
          }
          emptyMessage="No customers found."
        />
      ) : null}

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
          {isSubmitting ? 'Sending...' : 'Send announcement'}
        </button>
      </div>
    </div>
  );
}
