import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranchesFull, updateBranch } from '../../api/branches.api';
import {
  WEEKDAYS,
  type Branch,
  type OperatingHours,
  type Weekday,
} from '../../maintenance.types';
import { TimeInput } from '../../../hotel/components/TimeInput/TimeInput';
import styles from './SystemConfigurationPage.module.css';

/** Superadmin-only - deliberately narrower than every other maintenance
 * config page in this feature folder (all Admin+Superadmin), matching the
 * server's BRANCH_CONFIG_ROLES. */
const ALLOWED_VIEWER_ROLES = new Set(['Superadmin']);

const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

interface FormState {
  name: string;
  address: string;
  contact_number: string;
  is_vet_branch: boolean;
  timezone: string;
  operating_hours: OperatingHours;
}

function formStateFromBranch(branch: Branch): FormState {
  return {
    name: branch.name,
    address: branch.address,
    contact_number: branch.contact_number ?? '',
    is_vet_branch: branch.is_vet_branch,
    timezone: branch.timezone,
    operating_hours: branch.operating_hours,
  };
}

/**
 * Superadmin System Configuration - branch identity (name/address/contact)
 * and operating hours, which availability.service.ts's slot generation and
 * unavailabilityBlock.service.ts's shift-end resolution already read from
 * branches.operating_hours; this is the first UI to ever let anyone edit it.
 */
export function SystemConfigurationPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) {
      return;
    }

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) {
      return;
    }

    let isMounted = true;

    void listBranchesFull(accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load branches.');
        return;
      }

      setLoadError(null);
      setBranches(result.data);
      setSelectedBranchId((current) => current || (result.data![0]?.id ?? ''));
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId]
  );

  // Resets the form when selectedBranchId itself changes (switching
  // branches), via a direct render-time setState guarded by comparing
  // against the last-seen id - React's "adjusting state when a prop/derived
  // value changes" pattern - rather than a useEffect. Deliberately does NOT
  // key off the selectedBranch object or `branches` array: a successful save
  // below replaces the saved branch's entry in `branches` (new object
  // identity, same id) so the just-set success message can render post-save
  // without this getting re-triggered by that same state update.
  const [prevSelectedBranchId, setPrevSelectedBranchId] =
    useState(selectedBranchId);
  if (selectedBranchId !== prevSelectedBranchId) {
    setPrevSelectedBranchId(selectedBranchId);

    const branch = branches.find((item) => item.id === selectedBranchId);

    if (branch) {
      setForm(formStateFromBranch(branch));
      setMessage(null);
      setFormError(null);
    }
  }

  function setDayClosed(day: Weekday, closed: boolean) {
    setForm((prev) => {
      if (!prev) return prev;

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
      if (!prev) return prev;

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken || !form || !selectedBranch) {
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setMessage(null);

    const result = await updateBranch(selectedBranch.id, accessToken, {
      name: form.name,
      address: form.address,
      contact_number: form.contact_number.trim() ? form.contact_number : null,
      is_vet_branch: form.is_vet_branch,
      timezone: form.timezone,
      operating_hours: form.operating_hours,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not update the branch.');
      return;
    }

    setBranches((prev) =>
      prev.map((branch) =>
        branch.id === result.data!.id ? result.data! : branch
      )
    );
    setMessage('Branch configuration updated.');
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the system configuration panel.
          </p>
        </div>
      </main>
    );
  }

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (!isAllowedViewer) {
    return <Navigate to="/staff/profile" replace />;
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading branches...</p>
        </div>
      </main>
    );
  }

  if (loadError || !form || !selectedBranch) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            {loadError ?? 'No branches to configure.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>System Configuration</h1>
        <p className={styles.copy}>
          Branch identity and operating hours - the same operating_hours this
          drives Date &amp; Time slot generation and staff day-off shift-end
          resolution everywhere else in the app.
        </p>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Branch</span>
          <select
            className={styles.input}
            value={selectedBranchId}
            onChange={(event) => setSelectedBranchId(event.target.value)}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Branch name</span>
            <input
              className={styles.input}
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((prev) => prev && { ...prev, name: event.target.value })
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
                setForm(
                  (prev) => prev && { ...prev, address: event.target.value }
                )
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
                setForm(
                  (prev) =>
                    prev && { ...prev, contact_number: event.target.value }
                )
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
                setForm(
                  (prev) => prev && { ...prev, timezone: event.target.value }
                )
              }
              required
            />
          </label>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={form.is_vet_branch}
              onChange={(event) =>
                setForm(
                  (prev) =>
                    prev && { ...prev, is_vet_branch: event.target.checked }
                )
              }
            />
            <span>Veterinary services offered at this branch</span>
          </label>

          <section aria-labelledby="operating-hours-heading">
            <h2 className={styles.sectionTitle} id="operating-hours-heading">
              Operating hours
            </h2>
            <div className={styles.hoursTable}>
              {WEEKDAYS.map((day) => {
                const entry = form.operating_hours[day];
                const isClosed = !entry;

                return (
                  <div className={styles.hoursRow} key={day}>
                    <span className={styles.dayLabel}>
                      {WEEKDAY_LABELS[day]}
                    </span>
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
              {isSubmitting ? 'Saving...' : 'Save branch configuration'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
