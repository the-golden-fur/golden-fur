import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import {
  listPolicyConfigurations,
  resolveEffectivePolicy,
  updatePolicyConfiguration,
} from '../../api/policy.api';
import type {
  CreditExpiryMode,
  DownpaymentType,
  EnforcementMode,
  PolicyConfiguration,
  RescheduleFeeType,
} from '../../booking.types';
import { TimeInput } from '../../../hotel/components/TimeInput/TimeInput';
import styles from './PolicyConfigurationPage.module.css';

/** Admin+Superadmin - matches BOOKING_POLICY_WRITE_ROLES/policy_configurations
 * RLS server-side, unlike System Configuration's Superadmin-only gate. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

const SYSTEM_DEFAULT_OPTION = '';

interface FormState {
  notice_period_days: number;
  notice_enforcement_mode: EnforcementMode;
  notice_enforcement_enabled: boolean;
  staff_picker_enabled_grooming: boolean;
  staff_picker_enabled_veterinary: boolean;
  lunch_break_enabled: boolean;
  lunch_break_start: string;
  lunch_break_end: string;
  reschedule_fee_enabled: boolean;
  reschedule_fee_type: RescheduleFeeType;
  reschedule_fee_value: number;
  /** UI-only split of the nullable reschedule_free_allowance column - NULL
   * (unlimited, the documented default) round-trips as this checkbox plus
   * whatever number was last shown, rather than forcing the number input to
   * represent "no value" itself. */
  reschedule_free_allowance_unlimited: boolean;
  reschedule_free_allowance: number;
  credit_expiry_mode: CreditExpiryMode;
  credit_expiry_days: number;
  /** "YYYY-MM-DD"; '' when not in fixed_date mode. */
  credit_expiry_fixed_date: string;
  cancellation_credit_conversion_rate: number;
  online_payments_enabled: boolean;
  downpayment_enabled: boolean;
  downpayment_type: DownpaymentType;
  downpayment_amount: number;
  downpayment_hold_hours: number;
}

function formStateFromPolicy(policy: PolicyConfiguration): FormState {
  return {
    notice_period_days: policy.notice_period_days,
    notice_enforcement_mode: policy.notice_enforcement_mode,
    notice_enforcement_enabled: policy.notice_enforcement_enabled,
    staff_picker_enabled_grooming: policy.staff_picker_enabled_grooming,
    staff_picker_enabled_veterinary: policy.staff_picker_enabled_veterinary,
    lunch_break_enabled: policy.lunch_break_enabled,
    lunch_break_start: policy.lunch_break_start.slice(0, 5),
    lunch_break_end: policy.lunch_break_end.slice(0, 5),
    reschedule_fee_enabled: policy.reschedule_fee_enabled,
    reschedule_fee_type: policy.reschedule_fee_type ?? 'Flat',
    reschedule_fee_value: policy.reschedule_fee_value ?? 0,
    reschedule_free_allowance_unlimited:
      policy.reschedule_free_allowance === null,
    reschedule_free_allowance: policy.reschedule_free_allowance ?? 1,
    credit_expiry_mode: policy.credit_expiry_mode,
    credit_expiry_days: policy.credit_expiry_days,
    credit_expiry_fixed_date: policy.credit_expiry_fixed_date ?? '',
    cancellation_credit_conversion_rate:
      policy.cancellation_credit_conversion_rate,
    online_payments_enabled: policy.online_payments_enabled,
    downpayment_enabled: policy.downpayment_enabled,
    downpayment_type: policy.downpayment_type ?? 'Flat',
    downpayment_amount: policy.downpayment_amount ?? 0,
    downpayment_hold_hours: policy.downpayment_hold_hours,
  };
}

const DOCUMENTED_DEFAULTS: FormState = {
  notice_period_days: 3,
  notice_enforcement_mode: 'Strict',
  notice_enforcement_enabled: true,
  staff_picker_enabled_grooming: true,
  staff_picker_enabled_veterinary: true,
  lunch_break_enabled: true,
  lunch_break_start: '12:00',
  lunch_break_end: '13:00',
  reschedule_fee_enabled: false,
  reschedule_fee_type: 'Flat',
  reschedule_fee_value: 0,
  reschedule_free_allowance_unlimited: true,
  reschedule_free_allowance: 1,
  credit_expiry_mode: 'rolling',
  credit_expiry_days: 30,
  credit_expiry_fixed_date: '',
  cancellation_credit_conversion_rate: 100,
  online_payments_enabled: true,
  downpayment_enabled: false,
  downpayment_type: 'Flat',
  downpayment_amount: 0,
  downpayment_hold_hours: 24,
};

/**
 * Settings > Config > Policies. Surfaces the already-fully-built
 * policy_configurations backend (GET/PATCH /bookings/policy,
 * resolveEffectivePolicy/updatePolicyConfiguration) which previously had no
 * client consumer at all. Lets Admin/Superadmin configure the reschedule
 * notice period (read by reschedule.service.ts and the Bookings Queue's
 * Reschedule button gate), Staff Picker visibility, and the fixed lunch
 * break - system-wide default or per-branch override, same branch-selector
 * UX as System Configuration. (The Daycare overnight fee briefly lived here
 * too - Custom change: Daycare fee configuration - but moved to be
 * per-service instead, on live follow-up feedback, so each Daycare service
 * can set its own; see AdminServicesPage.)
 */
export function PolicyConfigurationPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [policies, setPolicies] = useState<PolicyConfiguration[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(
    SYSTEM_DEFAULT_OPTION
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(DOCUMENTED_DEFAULTS);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // "YYYY-MM-DD" today, for the credit-expiry past-date hint.
  const [todayIso] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!accessToken || !user?.id) return;

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
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;

    void listBranches().then((result) => {
      if (isMounted && result.data) setBranches(result.data);
    });

    void listPolicyConfigurations(accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load policy configuration.');
        return;
      }

      setLoadError(null);
      setPolicies(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const effectivePolicy = useMemo(
    () =>
      resolveEffectivePolicy(policies, selectedBranchId || null) ?? {
        ...DOCUMENTED_DEFAULTS,
        id: '',
        branch_id: selectedBranchId || null,
        created_at: '',
        updated_at: '',
      },
    [policies, selectedBranchId]
  );

  // React's "adjusting state when a derived value changes" pattern (same
  // technique SystemConfigurationPage uses for its own branch selector):
  // re-seeds the form from the resolved effective policy whenever the
  // branch selection changes, or once on the initial load.
  const [hasInitializedForm, setHasInitializedForm] = useState(false);
  const [prevSelectedBranchId, setPrevSelectedBranchId] =
    useState(selectedBranchId);
  if (
    !isLoading &&
    (!hasInitializedForm || selectedBranchId !== prevSelectedBranchId)
  ) {
    setHasInitializedForm(true);
    setPrevSelectedBranchId(selectedBranchId);
    setForm(formStateFromPolicy(effectivePolicy));
    setMessage(null);
    setFormError(null);
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) return;

    if (form.lunch_break_start >= form.lunch_break_end) {
      setFormError('Lunch break end must be after start.');
      return;
    }

    if (
      form.credit_expiry_mode === 'fixed_date' &&
      !form.credit_expiry_fixed_date
    ) {
      setFormError(
        'Pick the date all of this branch’s credit should expire on.'
      );
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setMessage(null);

    const result = await updatePolicyConfiguration(accessToken, {
      branch_id: selectedBranchId || null,
      notice_period_days: form.notice_period_days,
      notice_enforcement_mode: form.notice_enforcement_mode,
      notice_enforcement_enabled: form.notice_enforcement_enabled,
      staff_picker_enabled_grooming: form.staff_picker_enabled_grooming,
      staff_picker_enabled_veterinary: form.staff_picker_enabled_veterinary,
      lunch_break_enabled: form.lunch_break_enabled,
      lunch_break_start: form.lunch_break_start,
      lunch_break_end: form.lunch_break_end,
      reschedule_fee_enabled: form.reschedule_fee_enabled,
      reschedule_fee_type: form.reschedule_fee_type,
      reschedule_fee_value: form.reschedule_fee_value,
      reschedule_free_allowance: form.reschedule_free_allowance_unlimited
        ? null
        : form.reschedule_free_allowance,
      credit_expiry_mode: form.credit_expiry_mode,
      credit_expiry_days: form.credit_expiry_days,
      credit_expiry_fixed_date:
        form.credit_expiry_mode === 'fixed_date'
          ? form.credit_expiry_fixed_date
          : null,
      cancellation_credit_conversion_rate:
        form.cancellation_credit_conversion_rate,
      online_payments_enabled: form.online_payments_enabled,
      downpayment_enabled: form.downpayment_enabled,
      downpayment_type: form.downpayment_enabled ? form.downpayment_type : null,
      downpayment_amount: form.downpayment_enabled
        ? form.downpayment_amount
        : null,
      downpayment_hold_hours: form.downpayment_hold_hours,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not update the policy.');
      return;
    }

    setPolicies((prev) => {
      const next = prev.filter((row) => row.id !== result.data!.id);
      return [...next, result.data!];
    });
    setMessage('Policy configuration updated.');
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the policy configuration panel.
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
    return <Navigate to="/staff/settings" replace />;
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading policy configuration...</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Policies</h1>
        <p className={styles.copy}>
          Reschedule notice period and fee, Staff Picker visibility, the fixed
          lunch break, online payments and downpayment, cancellation credit, and
          credit expiry - system-wide default, or a per-branch override.
        </p>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Branch</span>
          <select
            className={styles.input}
            value={selectedBranchId}
            onChange={(event) => setSelectedBranchId(event.target.value)}
          >
            <option value={SYSTEM_DEFAULT_OPTION}>
              System default (all branches)
            </option>
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

        <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
          <section aria-labelledby="notice-heading">
            <h2 className={styles.sectionTitle} id="notice-heading">
              Reschedule notice period
            </h2>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={form.notice_enforcement_enabled}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    notice_enforcement_enabled: event.target.checked,
                  }))
                }
              />
              <span>Enforce a minimum notice period</span>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Minimum notice (days)</span>
              <input
                className={styles.input}
                type="number"
                min={0}
                value={form.notice_period_days}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    notice_period_days: Number(event.target.value),
                  }))
                }
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Enforcement mode</span>
              <select
                className={styles.input}
                value={form.notice_enforcement_mode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    notice_enforcement_mode: event.target
                      .value as EnforcementMode,
                  }))
                }
              >
                <option value="Strict">
                  Strict - block reschedule/cancel outright
                </option>
                <option value="Soft">
                  Soft - allow, but flag as a policy violation
                </option>
              </select>
            </label>
          </section>

          <section aria-labelledby="staff-picker-heading">
            <h2 className={styles.sectionTitle} id="staff-picker-heading">
              Staff Picker visibility
            </h2>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={form.staff_picker_enabled_grooming}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    staff_picker_enabled_grooming: event.target.checked,
                  }))
                }
              />
              <span>Enabled for Grooming</span>
            </label>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={form.staff_picker_enabled_veterinary}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    staff_picker_enabled_veterinary: event.target.checked,
                  }))
                }
              />
              <span>Enabled for Veterinary</span>
            </label>
          </section>

          <section aria-labelledby="lunch-heading">
            <h2 className={styles.sectionTitle} id="lunch-heading">
              Lunch break
            </h2>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={form.lunch_break_enabled}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    lunch_break_enabled: event.target.checked,
                  }))
                }
              />
              <span>No bookings during this window</span>
            </label>

            <div className={styles.hoursRow}>
              <TimeInput
                value={form.lunch_break_start}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, lunch_break_start: value }))
                }
                aria-label="Lunch break start"
              />
              <span className={styles.hoursSeparator}>to</span>
              <TimeInput
                value={form.lunch_break_end}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, lunch_break_end: value }))
                }
                aria-label="Lunch break end"
              />
            </div>
          </section>

          <section aria-labelledby="reschedule-fee-heading">
            <h2 className={styles.sectionTitle} id="reschedule-fee-heading">
              Reschedule fee
            </h2>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={form.reschedule_fee_enabled}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    reschedule_fee_enabled: event.target.checked,
                  }))
                }
              />
              <span>Charge a fee once the free allowance is used up</span>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Fee type</span>
              <select
                className={styles.input}
                value={form.reschedule_fee_type}
                disabled={!form.reschedule_fee_enabled}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    reschedule_fee_type: event.target
                      .value as RescheduleFeeType,
                  }))
                }
              >
                <option value="Flat">Flat (pesos)</option>
                <option value="Percentage">Percentage of booking total</option>
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {form.reschedule_fee_type === 'Flat'
                  ? 'Fee amount (PHP)'
                  : 'Fee (%)'}
              </span>
              <input
                className={styles.input}
                type="number"
                min={0}
                max={
                  form.reschedule_fee_type === 'Percentage' ? 100 : undefined
                }
                value={form.reschedule_fee_value}
                disabled={!form.reschedule_fee_enabled}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    reschedule_fee_value: Number(event.target.value),
                  }))
                }
              />
            </label>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={form.reschedule_free_allowance_unlimited}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    reschedule_free_allowance_unlimited: event.target.checked,
                  }))
                }
              />
              <span>Unlimited free reschedules</span>
            </label>

            {!form.reschedule_free_allowance_unlimited ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  Free reschedules allowed
                </span>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  value={form.reschedule_free_allowance}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      reschedule_free_allowance: Number(event.target.value),
                    }))
                  }
                />
              </label>
            ) : null}
          </section>

          <section aria-labelledby="online-payments-heading">
            <h2 className={styles.sectionTitle} id="online-payments-heading">
              Online payments
            </h2>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={form.online_payments_enabled}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    online_payments_enabled: event.target.checked,
                  }))
                }
              />
              <span>Allow customers to pay online via GCash/Maya</span>
            </label>
            <p className={styles.copy}>
              When disabled, the Pay button still shows on the customer's own
              Bookings page, but is disabled with an explanation - it never
              disappears entirely.
            </p>
          </section>

          <section aria-labelledby="downpayment-heading">
            <h2 className={styles.sectionTitle} id="downpayment-heading">
              Downpayment
            </h2>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={form.downpayment_enabled}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    downpayment_enabled: event.target.checked,
                  }))
                }
              />
              <span>Require a downpayment on the whole booking</span>
            </label>
            <p className={styles.copy}>
              Applies once to an online booking's total - across every
              service/package in it, and after any discount or promo - not per
              individual service. Walk-in bookings always pay in full.
            </p>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Downpayment type</span>
              <select
                className={styles.input}
                value={form.downpayment_type}
                disabled={!form.downpayment_enabled}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    downpayment_type: event.target.value as DownpaymentType,
                  }))
                }
              >
                <option value="Flat">Flat (pesos)</option>
                <option value="Percentage">Percentage of booking total</option>
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {form.downpayment_type === 'Flat'
                  ? 'Downpayment amount (PHP)'
                  : 'Downpayment (%)'}
              </span>
              <input
                className={styles.input}
                type="number"
                min={0}
                max={form.downpayment_type === 'Percentage' ? 100 : undefined}
                value={form.downpayment_amount}
                disabled={!form.downpayment_enabled}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    downpayment_amount: Number(event.target.value),
                  }))
                }
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Reservation hold (hours)
              </span>
              <input
                className={styles.input}
                type="number"
                min={1}
                value={form.downpayment_hold_hours}
                disabled={!form.downpayment_enabled}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    downpayment_hold_hours: Number(event.target.value),
                  }))
                }
              />
            </label>
            <p className={styles.copy}>
              An online booking that still owes its downpayment does not hold
              its slot - other customers can still book that time. If the
              downpayment isn&apos;t paid within this many hours, the booking is
              automatically cancelled. Default 24.
            </p>
          </section>

          <section aria-labelledby="cancellation-credit-heading">
            <h2
              className={styles.sectionTitle}
              id="cancellation-credit-heading"
            >
              Cancellation credit
            </h2>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Percent of payment returned as credit
              </span>
              <input
                className={styles.input}
                type="number"
                min={0}
                max={100}
                value={form.cancellation_credit_conversion_rate}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    cancellation_credit_conversion_rate: Number(
                      event.target.value
                    ),
                  }))
                }
              />
            </label>
            <p className={styles.copy}>
              When a booking is cancelled with enough notice, this much of what
              the customer already paid becomes account credit for a future
              visit. 100% gives the full amount back; lower it (e.g. 50%) to
              keep part of the payment as a cancellation charge. Cancellations
              that miss the notice period still forfeit everything.
            </p>
          </section>

          <section aria-labelledby="credit-expiry-heading">
            <h2 className={styles.sectionTitle} id="credit-expiry-heading">
              Credit expiry
            </h2>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>How credit expires</span>
              <select
                className={styles.input}
                value={form.credit_expiry_mode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    credit_expiry_mode: event.target.value as CreditExpiryMode,
                  }))
                }
              >
                <option value="none">Credit never expires</option>
                <option value="rolling">
                  Expire a set number of days after each credit is issued
                </option>
                <option value="fixed_date">
                  All of this branch&apos;s credit expires on one date
                </option>
              </select>
            </label>

            {form.credit_expiry_mode === 'rolling' ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Expires after (days)</span>
                <input
                  className={styles.input}
                  type="number"
                  min={1}
                  value={form.credit_expiry_days}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      credit_expiry_days: Number(event.target.value),
                    }))
                  }
                />
              </label>
            ) : null}

            {form.credit_expiry_mode === 'fixed_date' ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Expiry date</span>
                <input
                  className={styles.input}
                  type="date"
                  value={form.credit_expiry_fixed_date}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      credit_expiry_fixed_date: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}

            <p className={styles.copy}>
              Saving this re-applies to credit customers already hold at{' '}
              {selectedBranchId
                ? 'this branch'
                : 'every branch that follows the default'}
              , not just credit issued from now on.
              {form.credit_expiry_mode === 'fixed_date' &&
              form.credit_expiry_fixed_date &&
              form.credit_expiry_fixed_date < todayIso
                ? ' The date you picked is already past — that credit will be expired on the next sweep.'
                : ''}
            </p>
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
              {isSubmitting ? 'Saving...' : 'Save policy configuration'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
