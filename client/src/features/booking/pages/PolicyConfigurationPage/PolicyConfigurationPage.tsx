import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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
  CreditReviewMode,
  DownpaymentType,
  EnforcementMode,
  PolicyConfiguration,
  RescheduleFeeType,
} from '../../booking.types';
import { TimeInput } from '../../../hotel/components/TimeInput/TimeInput';
import { InfoPopover } from '../../../../shared/components/InfoPopover/InfoPopover';
import { useUnsavedChanges } from '../../../../shared/providers/UnsavedChangesProvider/useUnsavedChanges';
import { useUnsavedChangesContext } from '../../../../shared/providers/UnsavedChangesProvider/UnsavedChangesContext';
import styles from './PolicyConfigurationPage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

/** Admin+Superadmin - matches BOOKING_POLICY_WRITE_ROLES/policy_configurations
 * RLS server-side, unlike Branches' Superadmin-only gate. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

const SYSTEM_DEFAULT_OPTION = '';

/** "Mark as no-show after" unit choices for the grace-period number input -
 * the stored value (no_show_after_minutes) always stays in minutes,
 * matching the server (booking.validator.ts), regardless of which unit is
 * currently showing. */
const NO_SHOW_AFTER_UNITS: Array<{
  value: 'minutes' | 'hours';
  label: string;
}> = [
  { value: 'minutes', label: 'minutes' },
  { value: 'hours', label: 'hours' },
];

interface FormState {
  notice_period_days: number;
  notice_enforcement_mode: EnforcementMode;
  notice_enforcement_enabled: boolean;
  booking_notice_period_days: number;
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
  cancellation_grace_minutes: number;
  credit_review_mode: CreditReviewMode;
  downpayment_enabled: boolean;
  downpayment_type: DownpaymentType;
  downpayment_amount: number;
  downpayment_hold_hours: number;
  pay_at_checkout_enabled: boolean;
  pay_at_checkout_grace_minutes: number;
  max_concurrent_bookings_per_staff: number;
  booking_group_email_mode: 'combined' | 'per_booking';
  care_log_task_email_enabled: boolean;
  care_log_daily_report_enabled: boolean;
  customer_deactivation_auto_delete_days: number;
  no_show_after_minutes: number;
  /** UI-only - which unit the grace-period number input is currently
   * showing/accepting. no_show_after_minutes is always the source of truth,
   * in minutes, regardless of this. */
  no_show_after_unit: 'minutes' | 'hours';
  no_show_at_closing: boolean;
}

function formStateFromPolicy(policy: PolicyConfiguration): FormState {
  return {
    notice_period_days: policy.notice_period_days,
    notice_enforcement_mode: policy.notice_enforcement_mode,
    notice_enforcement_enabled: policy.notice_enforcement_enabled,
    booking_notice_period_days: policy.booking_notice_period_days,
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
    cancellation_grace_minutes: policy.cancellation_grace_minutes,
    credit_review_mode: policy.credit_review_mode,
    downpayment_enabled: policy.downpayment_enabled,
    downpayment_type: policy.downpayment_type ?? 'Flat',
    downpayment_amount: policy.downpayment_amount ?? 0,
    downpayment_hold_hours: policy.downpayment_hold_hours,
    pay_at_checkout_enabled: policy.pay_at_checkout_enabled,
    pay_at_checkout_grace_minutes: policy.pay_at_checkout_grace_minutes,
    max_concurrent_bookings_per_staff: policy.max_concurrent_bookings_per_staff,
    booking_group_email_mode: policy.booking_group_email_mode,
    care_log_task_email_enabled: policy.care_log_task_email_enabled,
    care_log_daily_report_enabled: policy.care_log_daily_report_enabled,
    customer_deactivation_auto_delete_days:
      policy.customer_deactivation_auto_delete_days,
    no_show_after_minutes: policy.no_show_after_minutes,
    no_show_after_unit:
      policy.no_show_after_minutes >= 60 &&
      policy.no_show_after_minutes % 60 === 0
        ? 'hours'
        : 'minutes',
    no_show_at_closing: policy.no_show_at_closing,
  };
}

const DOCUMENTED_DEFAULTS: FormState = {
  notice_period_days: 3,
  notice_enforcement_mode: 'Strict',
  notice_enforcement_enabled: true,
  booking_notice_period_days: 0,
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
  cancellation_grace_minutes: 60,
  credit_review_mode: 'Automatic',
  downpayment_enabled: false,
  downpayment_type: 'Flat',
  downpayment_amount: 0,
  downpayment_hold_hours: 24,
  pay_at_checkout_enabled: true,
  pay_at_checkout_grace_minutes: 10,
  max_concurrent_bookings_per_staff: 1,
  booking_group_email_mode: 'combined',
  care_log_task_email_enabled: false,
  care_log_daily_report_enabled: true,
  customer_deactivation_auto_delete_days: 30,
  no_show_after_minutes: 30,
  no_show_after_unit: 'minutes',
  no_show_at_closing: false,
};

/**
 * Settings > Config > Policies. Surfaces the already-fully-built
 * policy_configurations backend (GET/PATCH /bookings/policy,
 * resolveEffectivePolicy/updatePolicyConfiguration) which previously had no
 * client consumer at all. Lets Admin/Superadmin configure the reschedule
 * notice period (read by reschedule.service.ts and the Bookings Queue's
 * Reschedule button gate) and the fixed lunch break - system-wide default or
 * per-branch override, same branch-selector UX as Branches. (The
 * Daycare overnight fee briefly lived here too - Custom change: Daycare fee
 * configuration - but moved to be per-service instead, on live follow-up
 * feedback, so each Daycare service can set its own; see AdminServicesPage.
 * Staff Picker visibility/eligible roles similarly moved out - it's now
 * per-service-type, see AdminServiceTypesPage.)
 *
 * initialBranchId/lockBranchSelector (session 87): Branches' own "Configure"
 * row action pre-scopes this page to one branch, disabling the selector.
 * Both optional/additive - the standalone route renders this with neither.
 */
interface PolicyConfigurationPageProps {
  /** Branches page > a row's "Configure" action pre-scopes this page to
   * that one branch, instead of the standalone route's default "system
   * default" starting point. Both optional and additive - the standalone
   * /staff/admin/maintenance/policies route (kept for anyone with an old
   * link) renders this same component with neither prop set. */
  initialBranchId?: string;
  /** Disables the branch <select> so a pre-scoped visit can't be
   * accidentally re-pointed at a different branch. */
  lockBranchSelector?: boolean;
  /** Renders just the policies form - no page shell, title, intro copy or
   * branch selector - for use inside another surface (Branches' "Configure"
   * modal, which shows the branch's details and these policies together).
   * Only meaningful together with initialBranchId. */
  embedded?: boolean;
}

export function PolicyConfigurationPage({
  initialBranchId,
  lockBranchSelector,
  embedded,
}: PolicyConfigurationPageProps = {}) {
  const { user, accessToken } = useAuth();
  const unsavedChanges = useUnsavedChangesContext();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [policies, setPolicies] = useState<PolicyConfiguration[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(
    initialBranchId ?? SYSTEM_DEFAULT_OPTION
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

  const performSave = useCallback(async () => {
    if (!accessToken) return;

    if (form.lunch_break_start >= form.lunch_break_end) {
      const message = 'Lunch break end must be after start.';
      setFormError(message);
      throw new Error(message);
    }

    if (
      form.credit_expiry_mode === 'fixed_date' &&
      !form.credit_expiry_fixed_date
    ) {
      const message =
        'Pick the date all of this branch’s credit should expire on.';
      setFormError(message);
      throw new Error(message);
    }

    if (
      !Number.isInteger(form.pay_at_checkout_grace_minutes) ||
      form.pay_at_checkout_grace_minutes < 0 ||
      form.pay_at_checkout_grace_minutes > 59
    ) {
      const message =
        'The pay-at-checkout grace period must be a whole number of minutes from 0 to 59.';
      setFormError(message);
      throw new Error(message);
    }

    if (
      !Number.isInteger(form.no_show_after_minutes) ||
      form.no_show_after_minutes < 0 ||
      form.no_show_after_minutes > 1440
    ) {
      const message =
        'The no-show grace period must be between 0 minutes and 24 hours.';
      setFormError(message);
      throw new Error(message);
    }

    setIsSubmitting(true);
    setFormError(null);
    setMessage(null);

    const result = await updatePolicyConfiguration(accessToken, {
      branch_id: selectedBranchId || null,
      notice_period_days: form.notice_period_days,
      notice_enforcement_mode: form.notice_enforcement_mode,
      notice_enforcement_enabled: form.notice_enforcement_enabled,
      booking_notice_period_days: form.booking_notice_period_days,
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
      cancellation_grace_minutes: form.cancellation_grace_minutes,
      credit_review_mode: form.credit_review_mode,
      downpayment_enabled: form.downpayment_enabled,
      downpayment_type: form.downpayment_enabled ? form.downpayment_type : null,
      downpayment_amount: form.downpayment_enabled
        ? form.downpayment_amount
        : null,
      downpayment_hold_hours: form.downpayment_hold_hours,
      pay_at_checkout_enabled: form.pay_at_checkout_enabled,
      pay_at_checkout_grace_minutes: form.pay_at_checkout_grace_minutes,
      max_concurrent_bookings_per_staff: form.max_concurrent_bookings_per_staff,
      booking_group_email_mode: form.booking_group_email_mode,
      care_log_task_email_enabled: form.care_log_task_email_enabled,
      care_log_daily_report_enabled: form.care_log_daily_report_enabled,
      customer_deactivation_auto_delete_days:
        form.customer_deactivation_auto_delete_days,
      no_show_after_minutes: form.no_show_after_minutes,
      no_show_at_closing: form.no_show_at_closing,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      const message = result.error ?? 'Could not update the policy.';
      setFormError(message);
      throw new Error(message);
    }

    setPolicies((prev) => {
      const next = prev.filter((row) => row.id !== result.data!.id);
      return [...next, result.data!];
    });
    setMessage('Policy configuration updated.');
  }, [accessToken, form, selectedBranchId]);

  const handleDiscard = useCallback(() => {
    setFormError(null);
    setForm(formStateFromPolicy(effectivePolicy));
  }, [effectivePolicy]);

  const isDirty = useMemo(
    () =>
      JSON.stringify(form) !==
      JSON.stringify(formStateFromPolicy(effectivePolicy)),
    [form, effectivePolicy]
  );

  useUnsavedChanges({
    id: 'policy-configuration',
    label: selectedBranchId
      ? `Policies: ${branches.find((b) => b.id === selectedBranchId)?.name ?? 'branch'}`
      : 'Policies: system default',
    isDirty,
    onSave: performSave,
    onDiscard: handleDiscard,
  });

  const handleBranchSelect = (nextBranchId: string) => {
    const applySelection = () => setSelectedBranchId(nextBranchId);
    if (unsavedChanges) {
      unsavedChanges.guardIfDirty(applySelection);
    } else {
      applySelection();
    }
  };

  // A plain function (not a component) so the form's inputs keep their state
  // across renders. Embedded = just the content, without the full-page shell.
  const shell = (children: ReactNode) =>
    embedded ? (
      <div>{children}</div>
    ) : (
      <main className={styles.page}>
        <div className={styles.content}>{children}</div>
      </main>
    );

  if (!user?.id || !accessToken) {
    return shell(
      <p className={styles.errorBanner} role="alert">
        Unable to load the policy configuration panel.
      </p>
    );
  }

  if (isRoleLoading) {
    return shell(<LoadingState />);
  }

  if (!isAllowedViewer) {
    return <Navigate to="/staff/settings" replace />;
  }

  if (isLoading) {
    return shell(<LoadingState label="Loading policy configuration..." />);
  }

  if (loadError) {
    return shell(
      <p className={styles.errorBanner} role="alert">
        {loadError}
      </p>
    );
  }

  return shell(
    <>
      {embedded ? null : (
        <>
          <h1 className={styles.title}>Policies</h1>
          <p className={styles.copy}>
            Reschedule notice period and fee, new online booking notice period,
            the fixed lunch break, downpayment, cancellation credit, and credit
            expiry - system-wide default, or a per-branch override.
          </p>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Branch
              <InfoPopover label="About the Branch selector" align="left">
                Pick a branch to set rules just for that location, or leave it
                on &quot;System default&quot; to set the fallback rules every
                branch uses unless it has its own override saved here.
              </InfoPopover>
            </span>
            <select
              className={styles.input}
              aria-label="Branch"
              value={selectedBranchId}
              onChange={(event) => handleBranchSelect(event.target.value)}
              disabled={lockBranchSelector}
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
        </>
      )}

      {message ? (
        <p className={styles.successBanner} role="status">
          {message}
        </p>
      ) : null}

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void performSave().catch(() => {
            // formError is already set and shown below - nothing else to do.
          });
        }}
      >
        <section aria-labelledby="notice-heading">
          <h2 className={styles.sectionTitle} id="notice-heading">
            Reschedule notice period
            <InfoPopover label="About reschedule notice period" align="left">
              How far ahead of their appointment a customer must cancel or
              reschedule for it to count as "on time". Rules in this section
              only govern that - they don't stop a booking from being made in
              the first place.
            </InfoPopover>
          </h2>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              aria-label="Enforce a minimum notice period"
              checked={form.notice_enforcement_enabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  notice_enforcement_enabled: event.target.checked,
                }))
              }
            />
            <span>
              Enforce a minimum notice period
              <InfoPopover
                label="About enforcing the notice period"
                align="left"
              >
                Turn this off to let customers reschedule or cancel at any time
                with no penalty, no matter how last-minute. Turn it on to apply
                the minimum-notice rule below.
              </InfoPopover>
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Minimum notice (days)
              <InfoPopover label="About minimum notice days" align="left">
                How many full days before the appointment a customer needs to
                cancel or reschedule to avoid being flagged as late. For
                example, 3 means a Monday appointment needs to be changed by the
                Friday before.
              </InfoPopover>
            </span>
            <input
              className={styles.input}
              type="number"
              aria-label="Minimum notice (days)"
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
            <span className={styles.fieldLabel}>
              Enforcement mode
              <InfoPopover label="About enforcement mode" align="left">
                Strict stops a late reschedule or cancellation from going
                through at all. Soft still allows it, but marks it as a policy
                violation staff can see - nothing is blocked.
              </InfoPopover>
            </span>
            <select
              className={styles.input}
              aria-label="Enforcement mode"
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

        <section aria-labelledby="booking-notice-heading">
          <h2 className={styles.sectionTitle} id="booking-notice-heading">
            New online booking notice period
            <InfoPopover
              label="About new online booking notice period"
              align="left"
            >
              Separate from the reschedule rule above - this controls how soon a
              customer can book a brand-new appointment online, so staff aren't
              blindsided by same-day bookings they have no time to prepare for.
            </InfoPopover>
          </h2>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Minimum days before a new online booking (0 = same-day allowed)
              <InfoPopover
                label="About minimum days before a new booking"
                align="left"
              >
                How many days ahead a customer must book online. 0 lets them
                book for today; 1 means the earliest they can pick is tomorrow,
                and so on. This only applies to customers booking themselves and
                staff using New Booking - never to walk-ins.
              </InfoPopover>
            </span>
            <input
              className={styles.input}
              type="number"
              aria-label="Minimum days before a new online booking"
              min={0}
              value={form.booking_notice_period_days}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  booking_notice_period_days: Number(event.target.value),
                }))
              }
            />
          </label>
          <p className={styles.copy}>
            Separate from the reschedule notice above. Applies only to brand-new
            online bookings (customer self-service and receptionist New
            Booking), never to walk-ins.
          </p>
        </section>

        <section aria-labelledby="no-show-heading">
          <h2 className={styles.sectionTitle} id="no-show-heading">
            Late arrivals and no-shows
            <InfoPopover label="About late arrivals and no-shows" align="left">
              What happens when a customer doesn't turn up on time. A booking
              first shows as Late once its start time passes, then automatically
              becomes a No-show once the grace period below runs out.
            </InfoPopover>
          </h2>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Mark as no-show after
              <InfoPopover label="About the no-show grace period" align="left">
                How long a Late booking is still held before it's given up on
                and marked No-show. Pick a number and a unit - for example, "30
                minutes" or "2 hours" after the appointment was supposed to
                start.
              </InfoPopover>
            </span>
            <div className={styles.hoursRow}>
              <input
                className={styles.input}
                type="number"
                aria-label="No-show grace period"
                min={0}
                max={form.no_show_after_unit === 'hours' ? 24 : 1440}
                step={1}
                value={
                  form.no_show_after_unit === 'hours'
                    ? form.no_show_after_minutes / 60
                    : form.no_show_after_minutes
                }
                onChange={(event) => {
                  const entered = Number(event.target.value);
                  setForm((prev) => ({
                    ...prev,
                    no_show_after_minutes:
                      prev.no_show_after_unit === 'hours'
                        ? entered * 60
                        : entered,
                  }));
                }}
              />
              <select
                className={styles.input}
                aria-label="No-show grace period unit"
                value={form.no_show_after_unit}
                onChange={(event) => {
                  const nextUnit = event.target.value as 'minutes' | 'hours';
                  setForm((prev) => {
                    if (nextUnit === prev.no_show_after_unit) return prev;
                    const nextMinutes =
                      nextUnit === 'hours'
                        ? Math.round(prev.no_show_after_minutes / 60) * 60
                        : prev.no_show_after_minutes;
                    return {
                      ...prev,
                      no_show_after_unit: nextUnit,
                      no_show_after_minutes: nextMinutes,
                    };
                  });
                }}
              >
                {NO_SHOW_AFTER_UNITS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              aria-label="Auto-convert to no-show at the branch's closing hours"
              checked={form.no_show_at_closing}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  no_show_at_closing: event.target.checked,
                }))
              }
            />
            <span>
              Auto-convert to no-show at the branch's closing hours
              <InfoPopover
                label="About converting at closing hours"
                align="left"
              >
                Instead of (or alongside) the grace period above, wait until the
                branch closes for the day before marking a no-show. If the
                branch isn't open that day, it falls back to the grace period
                instead.
              </InfoPopover>
            </span>
          </label>

          <p className={styles.copy}>
            Once a booking's start time passes it shows as <em>Late</em> - the
            customer can still be checked in or the booking started as usual. If
            they still haven't arrived once the grace period above runs out, it
            becomes a <em>No-show</em>. With the checkbox on, it instead waits
            until the branch's closing hours that day, falling back to the grace
            period above on a day with no meaningful closing time.
          </p>
        </section>

        <section aria-labelledby="staff-concurrency-heading">
          <h2 className={styles.sectionTitle} id="staff-concurrency-heading">
            Staff concurrency
            <InfoPopover label="About staff concurrency" align="left">
              Controls how many appointments one groomer or vet can be assigned
              to at the exact same time slot.
            </InfoPopover>
          </h2>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Max concurrent bookings per staff member (1 = one pet at a time)
              <InfoPopover
                label="About max concurrent bookings per staff"
                align="left"
              >
                Raise this above 1 to let one staff member handle more than one
                pet at once - for example, bathing two small dogs side by side.
                The booking system won't let them be double-booked past this
                number.
              </InfoPopover>
            </span>
            <input
              className={styles.input}
              type="number"
              aria-label="Max concurrent bookings per staff member"
              min={1}
              value={form.max_concurrent_bookings_per_staff}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  max_concurrent_bookings_per_staff: Number(event.target.value),
                }))
              }
            />
          </label>
          <p className={styles.copy}>
            How many overlapping Grooming or Veterinary bookings one groomer /
            vet can be assigned in the same time window. Raise it to let one
            staff member handle several pets at once (e.g. two small dogs); the
            Staff Picker and the overbooking checks both honour this number.
          </p>
        </section>

        <section aria-labelledby="lunch-heading">
          <h2 className={styles.sectionTitle} id="lunch-heading">
            Lunch break
            <InfoPopover label="About lunch break" align="left">
              Blocks off a fixed daily window where nothing can be booked, the
              same way a closed time slot works - so staff always get an
              uninterrupted break.
            </InfoPopover>
          </h2>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              aria-label="No bookings during this window"
              checked={form.lunch_break_enabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  lunch_break_enabled: event.target.checked,
                }))
              }
            />
            <span>
              No bookings during this window
              <InfoPopover label="About the lunch break window" align="left">
                When this is on, the start and end times below become a
                no-booking window every day. Turn it off to allow bookings
                straight through the day with no fixed break.
              </InfoPopover>
            </span>
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
            <InfoPopover label="About reschedule fee" align="left">
              Lets a customer reschedule for free a limited number of times,
              then charges a fee for every reschedule after that.
            </InfoPopover>
          </h2>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              aria-label="Charge a fee once the free allowance is used up"
              checked={form.reschedule_fee_enabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  reschedule_fee_enabled: event.target.checked,
                }))
              }
            />
            <span>
              Charge a fee once the free allowance is used up
              <InfoPopover label="About charging a reschedule fee" align="left">
                Turn this on to start charging once a customer has used up their
                free reschedules, set further down. Leave it off and
                rescheduling always stays free, however many times they do it.
              </InfoPopover>
            </span>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Fee type
              <InfoPopover label="About reschedule fee type" align="left">
                Flat charges the same peso amount every time. Percentage charges
                a share of that booking's total price instead, so the fee scales
                with how much the booking costs.
              </InfoPopover>
            </span>
            <select
              className={styles.input}
              aria-label="Fee type"
              value={form.reschedule_fee_type}
              disabled={!form.reschedule_fee_enabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  reschedule_fee_type: event.target.value as RescheduleFeeType,
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
              <InfoPopover label="About the reschedule fee amount" align="left">
                How much to charge once the fee kicks in - a peso amount, or a
                percentage of the booking's total, depending on the fee type
                chosen above.
              </InfoPopover>
            </span>
            <input
              className={styles.input}
              type="number"
              aria-label="Reschedule fee amount"
              min={0}
              max={form.reschedule_fee_type === 'Percentage' ? 100 : undefined}
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
              aria-label="Unlimited free reschedules"
              checked={form.reschedule_free_allowance_unlimited}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  reschedule_free_allowance_unlimited: event.target.checked,
                }))
              }
            />
            <span>
              Unlimited free reschedules
              <InfoPopover
                label="About unlimited free reschedules"
                align="left"
              >
                When this is on, a customer can reschedule as many times as they
                like at no charge - the fee above never applies. Turn it off to
                set a specific free-reschedule limit below.
              </InfoPopover>
            </span>
          </label>

          {!form.reschedule_free_allowance_unlimited ? (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Free reschedules allowed
                <InfoPopover
                  label="About free reschedules allowed"
                  align="left"
                >
                  How many times a customer can reschedule one booking before
                  the fee above starts applying. For example, 1 means their
                  first reschedule is free and every one after that is charged.
                </InfoPopover>
              </span>
              <input
                className={styles.input}
                type="number"
                aria-label="Free reschedules allowed"
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

        <section aria-labelledby="downpayment-heading">
          <h2 className={styles.sectionTitle} id="downpayment-heading">
            Downpayment
            <InfoPopover label="About downpayment" align="left">
              Requires a customer to pay part of their booking upfront, online,
              to secure the reservation - the rest is settled later. Walk-ins
              always pay in full, so this never applies to them.
            </InfoPopover>
          </h2>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              aria-label="Require a downpayment on the whole booking"
              checked={form.downpayment_enabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  downpayment_enabled: event.target.checked,
                }))
              }
            />
            <span>
              Require a downpayment on the whole booking
              <InfoPopover label="About requiring a downpayment" align="left">
                Turn this on to require part-payment before an online booking is
                confirmed. It applies once to the whole checkout total, not
                separately to each service or pet in it.
              </InfoPopover>
            </span>
          </label>
          <p className={styles.copy}>
            Applies once to an online booking's total - across every
            service/package in it, and after any discount or promo - not per
            individual service. Walk-in bookings always pay in full.
          </p>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Downpayment type
              <InfoPopover label="About downpayment type" align="left">
                Flat charges the same peso amount for every booking. Percentage
                charges a share of that booking's total instead, so bigger
                bookings require a bigger downpayment.
              </InfoPopover>
            </span>
            <select
              className={styles.input}
              aria-label="Downpayment type"
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
              <InfoPopover label="About the downpayment amount" align="left">
                How much a customer must pay upfront to secure their booking - a
                peso amount, or a percentage of the total, depending on the type
                chosen above.
              </InfoPopover>
            </span>
            <input
              className={styles.input}
              type="number"
              aria-label="Downpayment amount"
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
              <InfoPopover label="About reservation hold hours" align="left">
                How long an unpaid booking holds its slot before it's
                automatically cancelled for non-payment. Gives a customer time
                to pay without the slot getting snapped up, but doesn't let them
                hold it forever.
              </InfoPopover>
            </span>
            <input
              className={styles.input}
              type="number"
              aria-label="Reservation hold (hours)"
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
            If no payment is made within this many hours, the booking is
            automatically cancelled.
          </p>
        </section>

        <section aria-labelledby="pay-at-checkout-heading">
          <h2 className={styles.sectionTitle} id="pay-at-checkout-heading">
            Pay at checkout
            <InfoPopover label="About pay at checkout" align="left">
              Lets staff book a Hotel or Daycare walk-in without charging
              anything upfront - the pet's actual bill is settled later, when
              the owner picks them up.
            </InfoPopover>
          </h2>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              aria-label="Allow pay at checkout for walk-in Hotel and Daycare"
              checked={form.pay_at_checkout_enabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  pay_at_checkout_enabled: event.target.checked,
                }))
              }
            />
            <span>
              Allow pay at checkout for walk-in Hotel and Daycare
              <InfoPopover label="About allowing pay at checkout" align="left">
                Turn this on to let staff reserve a cage for a walk-in with no
                payment collected yet. Billing starts once the pet is checked
                in, and the cashier charges the full stay at checkout.
              </InfoPopover>
            </span>
          </label>
          <p className={styles.copy}>
            Staff can book a walk-in without charging anything up front. Billing
            starts when the pet is checked in, and the bill for the actual stay
            goes to the cashier at checkout. The cage is reserved with no
            payment.
          </p>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Grace period (minutes)
              <InfoPopover
                label="About the pay-at-checkout grace period"
                align="left"
              >
                Daycare bills by the hour. This lets a stay run a few minutes
                past a full hour without charging for another one. Set it to 0
                to charge for every hour that's started, even by a minute.
              </InfoPopover>
            </span>
            <input
              className={styles.input}
              type="number"
              aria-label="Pay-at-checkout grace period (minutes)"
              min={0}
              max={59}
              step={1}
              value={form.pay_at_checkout_grace_minutes}
              disabled={!form.pay_at_checkout_enabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  pay_at_checkout_grace_minutes: Number(event.target.value),
                }))
              }
            />
          </label>
          <p className={styles.copy}>
            Daycare is billed by the hour. A stay that runs up to this many
            minutes past a full hour is not charged for another hour. Set 0 to
            charge every started hour. It does not extend closing time.
          </p>
        </section>

        <section aria-labelledby="cancellation-credit-heading">
          <h2 className={styles.sectionTitle} id="cancellation-credit-heading">
            Cancellation credit
            <InfoPopover label="About cancellation credit" align="left">
              What a customer gets back, as account credit, when they cancel a
              paid booking - instead of a cash refund.
            </InfoPopover>
          </h2>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Percent of payment returned as credit
              <InfoPopover
                label="About percent returned as credit"
                align="left"
              >
                How much of what the customer paid comes back as credit when
                they cancel within the notice period. 100% returns everything; a
                lower number keeps part of the payment as a cancellation charge.
              </InfoPopover>
            </span>
            <input
              className={styles.input}
              type="number"
              aria-label="Percent of payment returned as credit"
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
            Share of a paid cancellation returned as credit, if the notice
            period was met - 100% is a full refund, lower keeps part as a
            charge. Missed notice forfeits the payment entirely, except within
            the grace period below.
          </p>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Grace period for last-minute bookings (minutes)
              <InfoPopover
                label="About the cancellation grace period"
                align="left"
              >
                A booking made too close to the appointment can never meet the
                notice period above, through no fault of the customer. This
                gives them a window, right after booking, to still cancel for
                credit even though notice couldn't be met.
              </InfoPopover>
            </span>
            <input
              className={styles.input}
              type="number"
              aria-label="Cancellation grace period (minutes)"
              min={0}
              max={1440}
              step={1}
              value={form.cancellation_grace_minutes}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  cancellation_grace_minutes: Number(event.target.value),
                }))
              }
            />
          </label>
          <p className={styles.copy}>
            A booking made less than the notice period ahead can never meet it.
            If the customer cancels within this many minutes of booking, their
            payment still becomes credit. Set 0 to turn this off.
          </p>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Who decides the credit
              <InfoPopover label="About who decides the credit" align="left">
                Automatic follows the notice-period rule above with no human
                involved. Manual sends every paid cancellation to a staff member
                instead, who reads the customer's reason and decides whether to
                approve or deny the credit.
              </InfoPopover>
            </span>
            <select
              className={styles.input}
              aria-label="Who decides the credit"
              value={form.credit_review_mode}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  credit_review_mode: event.target.value as CreditReviewMode,
                }))
              }
            >
              <option value="Automatic">
                Automatic - decided by the notice period, above
              </option>
              <option value="Manual">
                Manual - a staff member reviews each cancellation reason
              </option>
            </select>
          </label>
          <p className={styles.copy}>
            Manual ignores the notice period above entirely - every cancellation
            with a payment goes to the Credit Review Queue for a staff member to
            approve or deny after reading why the customer cancelled.
          </p>
        </section>

        <section aria-labelledby="credit-expiry-heading">
          <h2 className={styles.sectionTitle} id="credit-expiry-heading">
            Credit expiry
            <InfoPopover label="About credit expiry" align="left">
              Whether a customer's account credit (from a cancellation, for
              example) eventually expires if they don't use it, and when.
            </InfoPopover>
          </h2>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              How credit expires
              <InfoPopover label="About how credit expires" align="left">
                "Never expires" keeps credit usable indefinitely. "Expire a set
                number of days after each credit is issued" gives each credit
                its own countdown from the day it was earned. "All credit
                expires on one date" wipes every customer's credit on a single
                calendar date you choose, regardless of when they earned it.
              </InfoPopover>
            </span>
            <select
              className={styles.input}
              aria-label="How credit expires"
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
              <span className={styles.fieldLabel}>
                Expires after (days)
                <InfoPopover label="About expires after days" align="left">
                  How many days a customer has to use a piece of credit, counted
                  from the day it was issued to them, before it expires.
                </InfoPopover>
              </span>
              <input
                className={styles.input}
                type="number"
                aria-label="Expires after (days)"
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
              <span className={styles.fieldLabel}>
                Expiry date
                <InfoPopover label="About the expiry date" align="left">
                  The single calendar date every customer's unused credit at
                  this branch expires on - no matter when each piece of credit
                  was originally issued.
                </InfoPopover>
              </span>
              <input
                className={styles.input}
                type="date"
                aria-label="Credit expiry date"
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

        <section aria-labelledby="email-notifications-heading">
          <h2 className={styles.sectionTitle} id="email-notifications-heading">
            Customer email notifications
            <InfoPopover
              label="About customer email notifications"
              align="left"
            >
              Which emails customers automatically receive about their bookings
              and hotel stays - separate from the in-app notifications, which
              always fire regardless of these settings.
            </InfoPopover>
          </h2>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Bundled checkout confirmation email
              <InfoPopover
                label="About the checkout confirmation email"
                align="left"
              >
                When a customer books several pets or services in one checkout,
                send one combined "your bookings are confirmed" email, or a
                separate confirmation email for each individual booking.
              </InfoPopover>
            </span>
            <select
              className={styles.input}
              aria-label="Bundled checkout confirmation email"
              value={form.booking_group_email_mode}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  booking_group_email_mode: event.target.value as
                    | 'combined'
                    | 'per_booking',
                }))
              }
            >
              <option value="combined">
                One combined email for the whole checkout
              </option>
              <option value="per_booking">
                One email per booking in the checkout
              </option>
            </select>
          </label>
          <p className={styles.copy}>
            When a customer books several pets/services in one checkout, send a
            single &quot;your bookings are confirmed&quot; email instead of one
            per booking. The in-app notification is always one per booking
            either way.
          </p>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              aria-label="Email the customer as each hotel care task is completed"
              checked={form.care_log_task_email_enabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  care_log_task_email_enabled: event.target.checked,
                }))
              }
            />
            <span>
              Email the customer as each hotel care task is completed
              <InfoPopover
                label="About emailing on each completed task"
                align="left"
              >
                Off by default, since a busy hotel day logs many small tasks per
                pet (feeding, walking, medication) and this would send an email
                for every single one. The nightly summary below is the gentler
                alternative.
              </InfoPopover>
            </span>
          </label>
          <p className={styles.copy}>
            Off by default - a busy hotel day logs many tasks per pet. The
            in-app notification still fires for each; leave this off and the
            nightly summary below covers the customer instead.
          </p>

          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              aria-label="Send a nightly care summary for each hotel stay"
              checked={form.care_log_daily_report_enabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  care_log_daily_report_enabled: event.target.checked,
                }))
              }
            />
            <span>
              Send a nightly care summary for each hotel stay
              <InfoPopover label="About the nightly care summary" align="left">
                One email per evening, per pet currently staying, listing that
                day's completed, missed, and still-upcoming care tasks - a
                single daily update instead of one email per task.
              </InfoPopover>
            </span>
          </label>
          <p className={styles.copy}>
            One email per active hotel stay each evening, listing that
            day&apos;s completed, missed, and still-scheduled care tasks.
          </p>
        </section>

        <section aria-labelledby="customer-deactivation-heading">
          <h2
            className={styles.sectionTitle}
            id="customer-deactivation-heading"
          >
            Customer account deletion
            <InfoPopover label="About customer account deletion" align="left">
              How long a deactivated customer account is kept before it's
              permanently erased - applies system-wide to every branch, not per
              branch, since customer accounts aren't tied to one location.
            </InfoPopover>
          </h2>
          <p className={styles.copy}>
            When a customer deactivates their own account (Settings &gt;
            Danger), it&apos;s permanently deleted after this many days if they
            don&apos;t log back in to reactivate it. Customers aren&apos;t
            branch-scoped, so this only ever applies system-wide - editable here
            only when configuring the system default, not a branch override.
          </p>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Delete after (days of inactivity)
              <InfoPopover
                label="About delete after days of inactivity"
                align="left"
              >
                How many days after a customer deactivates their own account
                it's permanently removed, if they never log back in to
                reactivate it.
              </InfoPopover>
            </span>
            <input
              className={styles.input}
              type="number"
              aria-label="Delete after (days of inactivity)"
              min={1}
              disabled={Boolean(selectedBranchId)}
              value={form.customer_deactivation_auto_delete_days}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  customer_deactivation_auto_delete_days: Number(
                    event.target.value
                  ),
                }))
              }
            />
          </label>
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
    </>
  );
}
