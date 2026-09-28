import { useState, type FormEvent } from 'react';
import { TimeInput } from '../../../hotel/components/TimeInput/TimeInput';
import {
  WEEKDAYS,
  type Branch,
  type OperatingHours,
  type Weekday,
} from '../../maintenance.types';
import styles from './BranchDetailsForm.module.css';

const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

interface BranchFormState {
  name: string;
  address: string;
  contact_number: string;
  is_vet_branch: boolean;
  timezone: string;
  operating_hours: OperatingHours;
}

const EMPTY_FORM: BranchFormState = {
  name: '',
  address: '',
  contact_number: '',
  is_vet_branch: false,
  timezone: 'Asia/Manila',
  operating_hours: {},
};

function formStateFromBranch(branch: Branch): BranchFormState {
  return {
    name: branch.name,
    address: branch.address,
    contact_number: branch.contact_number ?? '',
    is_vet_branch: branch.is_vet_branch,
    timezone: branch.timezone,
    operating_hours: branch.operating_hours,
  };
}

export interface BranchDetailsPayload {
  name: string;
  address: string;
  contact_number: string | null;
  is_vet_branch: boolean;
  timezone: string;
  operating_hours: OperatingHours;
}

interface BranchDetailsFormProps {
  /** The branch being configured, or null to fill in a brand-new one. */
  branch: Branch | null;
  submitLabel: string;
  /** Resolves to an error message to show under the form, or null on
   * success - the caller decides what success looks like (close a modal,
   * show a banner, ...). */
  onSubmit: (payload: BranchDetailsPayload) => Promise<string | null>;
}

/**
 * Branch identity + operating hours form (name, address, contact, timezone,
 * vet flag, weekly hours) - shared by "Add branch" and the combined
 * "Configure branch" page, which used to be two separate menu items (Edit
 * details / Configure policies).
 */
export function BranchDetailsForm({
  branch,
  submitLabel,
  onSubmit,
}: BranchDetailsFormProps) {
  const [form, setForm] = useState<BranchFormState>(
    branch ? formStateFromBranch(branch) : EMPTY_FORM
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setDayClosed(day: Weekday, closed: boolean) {
    setForm((prev) => {
      const next = { ...prev.operating_hours };
      if (closed) {
        delete next[day];
      } else {
        next[day] = { open: '09:00', close: '18:00' };
      }
      return { ...prev, operating_hours: next };
    });
  }

  function setDayTime(day: Weekday, field: 'open' | 'close', value: string) {
    setForm((prev) => {
      const existing = prev.operating_hours[day] ?? {
        open: '09:00',
        close: '18:00',
      };
      return {
        ...prev,
        operating_hours: {
          ...prev.operating_hours,
          [day]: { ...existing, [field]: value },
        },
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim() || !form.address.trim() || !form.timezone.trim()) {
      setFormError('Name, address, and timezone are required.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const error = await onSubmit({
      name: form.name.trim(),
      address: form.address.trim(),
      contact_number: form.contact_number.trim()
        ? form.contact_number.trim()
        : null,
      is_vet_branch: form.is_vet_branch,
      timezone: form.timezone.trim(),
      operating_hours: form.operating_hours,
    });

    setIsSubmitting(false);
    setFormError(error);
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Branch name</span>
        <input
          className={styles.input}
          type="text"
          value={form.name}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, name: event.target.value }))
          }
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Address</span>
        <input
          className={styles.input}
          type="text"
          value={form.address}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, address: event.target.value }))
          }
          required
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Contact number</span>
        <input
          className={styles.input}
          type="text"
          value={form.contact_number}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              contact_number: event.target.value,
            }))
          }
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Timezone</span>
        <input
          className={styles.input}
          type="text"
          value={form.timezone}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, timezone: event.target.value }))
          }
          required
        />
      </label>

      <label className={styles.checkboxField}>
        <input
          type="checkbox"
          checked={form.is_vet_branch}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              is_vet_branch: event.target.checked,
            }))
          }
        />
        <span>Veterinary services offered at this branch</span>
      </label>

      <section aria-labelledby="operating-hours-heading">
        <h3 className={styles.sectionTitle} id="operating-hours-heading">
          Operating hours
        </h3>
        <div className={styles.hoursTable}>
          {WEEKDAYS.map((day) => {
            const entry = form.operating_hours[day];
            const isClosed = !entry;

            return (
              <div className={styles.hoursRow} key={day}>
                <span className={styles.dayLabel}>{WEEKDAY_LABELS[day]}</span>
                <label className={styles.closedField}>
                  <input
                    type="checkbox"
                    checked={isClosed}
                    onChange={(event) =>
                      setDayClosed(day, event.target.checked)
                    }
                  />
                  <span>Closed</span>
                </label>
                {!isClosed ? (
                  <>
                    <TimeInput
                      value={entry.open}
                      onChange={(value) => setDayTime(day, 'open', value)}
                      aria-label={`${WEEKDAY_LABELS[day]} opening time`}
                    />
                    <span className={styles.hoursSeparator}>to</span>
                    <TimeInput
                      value={entry.close}
                      onChange={(value) => setDayTime(day, 'close', value)}
                      aria-label={`${WEEKDAY_LABELS[day]} closing time`}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {formError ? (
        <p className={styles.errorBanner} role="alert">
          {formError}
        </p>
      ) : null}

      <div className={styles.formActions}>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
