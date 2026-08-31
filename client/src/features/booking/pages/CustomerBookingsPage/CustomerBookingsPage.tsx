import { useEffect, useMemo, useState } from 'react';
import { useNowMs } from '../../../../shared/hooks/useNowMs/useNowMs';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listCustomerPets } from '../../../customers/api/customer.api';
import type { Pet } from '../../../customers/customer.types';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { BookingConfirmationBadge } from '../../components/shared/BookingConfirmationBadge/BookingConfirmationBadge';
import { SlotPicker } from '../../components/SlotPicker/SlotPicker';
import { StaffPickerList } from '../../components/StaffPickerList/StaffPickerList';
import {
  cancelBooking,
  getOnlinePaymentsStatus,
  listBookings,
  payForBooking,
  rescheduleBooking,
} from '../../api/booking.api';
import {
  CANCELLABLE_BOOKING_STATUSES,
  PAYABLE_BOOKING_STATUSES,
  RESCHEDULABLE_BOOKING_STATUSES,
  type Booking,
  type StaffPreferenceInput,
} from '../../booking.types';
import styles from './CustomerBookingsPage.module.css';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatPeso(amount: number): string {
  return `PHP ${amount.toFixed(2)}`;
}

type ActiveAction = {
  bookingId: string;
  type: 'reschedule' | 'cancel' | 'pay';
};

/**
 * Issue #59: the customer's own bookings, with reschedule (re-entering the
 * Slot/Staff Picker scoped to the existing booking, per dev notes - not a
 * full re-entry of the 8-step flow) and cancel (behind an explicit confirm
 * step, AC-5).
 */
export function CustomerBookingsPage() {
  const { user, accessToken } = useAuth();
  const nowMs = useNowMs();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [rescheduleStaffPreference, setRescheduleStaffPreference] =
    useState<StaffPreferenceInput | null>(null);
  // Resolved from GET /bookings/staff-picker (customer-accessible) once
  // StaffPickerList mounts - not GET /bookings/policy, which is staff-only
  // (#52). See StaffPickerList's onUnavailable contract.
  const [staffPickerUnavailable, setStaffPickerUnavailable] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [payPaymentMethod, setPayPaymentMethod] = useState<'GCash' | 'Maya'>(
    'GCash'
  );
  const [payInFull, setPayInFull] = useState(true);
  const [onlinePaymentsByBranch, setOnlinePaymentsByBranch] = useState<
    Map<string, boolean>
  >(new Map());
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void Promise.all([
      listBookings(accessToken),
      listCustomerPets(user.id, accessToken),
      listBranches(),
    ]).then(([bookingsResult, petsResult, branchesResult]) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (bookingsResult.error || !bookingsResult.data) {
        setLoadError(bookingsResult.error ?? 'Could not load your bookings.');
        return;
      }

      setBookings(bookingsResult.data);
      setPets(petsResult.data ?? []);
      setBranches(branchesResult.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  // One online-payments-status lookup per distinct branch a booking belongs
  // to, so the Pay button can be disabled up front rather than only failing
  // once clicked - branches rarely differ across a customer's own bookings,
  // but nothing here assumes there's only one.
  useEffect(() => {
    if (!accessToken || bookings.length === 0) return;

    let isMounted = true;
    const branchIds = [
      ...new Set(bookings.map((booking) => booking.branch_id)),
    ];

    void Promise.all(
      branchIds.map((branchId) =>
        getOnlinePaymentsStatus(branchId, accessToken).then(
          (result) =>
            [branchId, result.data?.online_payments_enabled ?? true] as const
        )
      )
    ).then((entries) => {
      if (isMounted) setOnlinePaymentsByBranch(new Map(entries));
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, bookings]);

  const petNameById = useMemo(
    () => new Map(pets.map((pet) => [pet.id, pet.name])),
    [pets]
  );
  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );

  function replaceBooking(updated: Booking) {
    setBookings((prev) =>
      prev.map((booking) => (booking.id === updated.id ? updated : booking))
    );
  }

  function openReschedule(booking: Booking) {
    setActiveAction({ bookingId: booking.id, type: 'reschedule' });
    setRescheduleSlot(null);
    setRescheduleStaffPreference(null);
    setStaffPickerUnavailable(false);
    setActionError(null);
    setActionMessage(null);
  }

  function openCancel(booking: Booking) {
    setActiveAction({ bookingId: booking.id, type: 'cancel' });
    setCancellationReason('');
    setActionError(null);
    setActionMessage(null);
  }

  function openPay(booking: Booking) {
    setActiveAction({ bookingId: booking.id, type: 'pay' });
    setPayPaymentMethod('GCash');
    // 'Paid in Advance' only ever has one thing left to pay (the
    // remainder) - offering the downpayment/full choice again wouldn't
    // mean anything, payForBooking always charges the remainder regardless
    // of what's sent for that stage.
    setPayInFull(
      booking.payment_stage === 'Paid in Advance' ||
        !booking.downpayment_required
    );
    setActionError(null);
    setActionMessage(null);
  }

  function closeAction() {
    setActiveAction(null);
  }

  async function confirmPay(booking: Booking) {
    if (!accessToken) return;

    setIsSubmittingAction(true);
    setActionError(null);

    const result = await payForBooking(booking.id, accessToken, {
      payment_method: payPaymentMethod,
      pay_in_full: payInFull,
    });

    if (result.error || !result.data) {
      setIsSubmittingAction(false);
      setActionError(result.error ?? 'Could not start this payment.');
      return;
    }

    // Real PayMongo-hosted checkout - leaves the app entirely, same as the
    // cashier "Customer portal" GCash/Maya channel's own redirect.
    window.location.href = result.data.checkoutUrl;
  }

  async function confirmReschedule(booking: Booking) {
    if (!accessToken || !rescheduleSlot) return;

    setIsSubmittingAction(true);
    setActionError(null);

    const result = await rescheduleBooking(booking.id, accessToken, {
      scheduled_start: rescheduleSlot.start,
      scheduled_end: rescheduleSlot.end,
      ...(rescheduleStaffPreference
        ? { staff_preference: rescheduleStaffPreference }
        : {}),
    });

    setIsSubmittingAction(false);

    if (result.error || !result.data) {
      setActionError(result.error ?? 'Could not reschedule this booking.');
      return;
    }

    replaceBooking(result.data.booking);
    setActionMessage(
      result.data.policy_violation
        ? 'Rescheduled, but this change did not meet the configured notice period.'
        : 'Booking rescheduled.'
    );
    setActiveAction(null);
  }

  async function confirmCancel(booking: Booking) {
    if (!accessToken) return;

    setIsSubmittingAction(true);
    setActionError(null);

    const result = await cancelBooking(booking.id, accessToken, {
      ...(cancellationReason.trim()
        ? { cancellation_reason: cancellationReason.trim() }
        : {}),
    });

    setIsSubmittingAction(false);

    if (result.error || !result.data) {
      setActionError(result.error ?? 'Could not cancel this booking.');
      return;
    }

    replaceBooking(result.data.booking);
    setActionMessage(
      result.data.policy_violation
        ? 'Booking cancelled without meeting the configured notice period.'
        : 'Booking cancelled.'
    );
    setActiveAction(null);
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your bookings.
        </p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading your bookings...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          {loadError}
        </p>
      </main>
    );
  }

  // AC-5: cancellation always goes through this explicit modal dialog - a
  // stray/double click on the row's "Cancel" button opens it, it never
  // executes the cancellation.
  const cancelTarget =
    activeAction?.type === 'cancel'
      ? bookings.find((booking) => booking.id === activeAction.bookingId)
      : undefined;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>My bookings</h1>

      {actionMessage ? (
        <p className={styles.successBanner} role="status">
          {actionMessage}
        </p>
      ) : null}

      {bookings.length === 0 ? (
        <p className={styles.copy}>You have no bookings yet.</p>
      ) : (
        <ul className={styles.bookingList}>
          {bookings.map((booking) => {
            // Reschedule additionally requires the appointment itself to
            // still be ahead of us - matches reschedule.service.ts's own
            // past-due guard server-side.
            const isPastDue =
              new Date(booking.scheduled_start).getTime() <= nowMs;
            const canReschedule =
              RESCHEDULABLE_BOOKING_STATUSES.includes(booking.status) &&
              !isPastDue;
            const canCancel = CANCELLABLE_BOOKING_STATUSES.includes(
              booking.status
            );
            const canPay =
              PAYABLE_BOOKING_STATUSES.includes(booking.status) &&
              booking.payment_stage !== 'Paid';
            const onlinePaymentsEnabled =
              onlinePaymentsByBranch.get(booking.branch_id) ?? true;
            const isRescheduling =
              activeAction?.bookingId === booking.id &&
              activeAction.type === 'reschedule';
            const isCancelling =
              activeAction?.bookingId === booking.id &&
              activeAction.type === 'cancel';
            const isPaying =
              activeAction?.bookingId === booking.id &&
              activeAction.type === 'pay';

            const durationMinutes = Math.round(
              (new Date(booking.scheduled_end).getTime() -
                new Date(booking.scheduled_start).getTime()) /
                60000
            );
            const petWeightClass =
              booking.service_category === 'Hotel'
                ? (pets.find((pet) => pet.id === booking.pet_id)
                    ?.weight_class ?? undefined)
                : undefined;
            const showStaffPicker =
              (booking.service_category === 'Grooming' ||
                booking.service_category === 'Veterinary') &&
              rescheduleSlot !== null &&
              !staffPickerUnavailable;

            return (
              <li key={booking.id} className={styles.bookingRow}>
                <div className={styles.bookingMain}>
                  <span className={styles.bookingTitle}>
                    {booking.service_category} -{' '}
                    {petNameById.get(booking.pet_id) ?? 'Pet'}
                  </span>
                  <span className={styles.bookingMeta}>
                    {branchNameById.get(booking.branch_id) ?? 'Branch'} -{' '}
                    {formatDateTime(booking.scheduled_start)}
                  </span>
                  <BookingConfirmationBadge booking={booking} />
                </div>

                {(canReschedule || canCancel || canPay) &&
                !isRescheduling &&
                !isCancelling &&
                !isPaying ? (
                  <div className={styles.bookingControls}>
                    {canPay ? (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={!onlinePaymentsEnabled}
                        title={
                          onlinePaymentsEnabled
                            ? undefined
                            : 'Online payments are currently unavailable for this branch - please pay at the branch instead.'
                        }
                        onClick={() => openPay(booking)}
                      >
                        Pay
                      </button>
                    ) : null}
                    {canReschedule ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => openReschedule(booking)}
                      >
                        Reschedule
                      </button>
                    ) : null}
                    {canCancel ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => openCancel(booking)}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {isPaying ? (
                  <div className={styles.actionPanel}>
                    {booking.payment_stage === 'Unpaid' &&
                    booking.downpayment_required &&
                    booking.downpayment_amount ? (
                      <fieldset className={styles.field}>
                        <legend className={styles.fieldLabel}>
                          How much would you like to pay now?
                        </legend>
                        <label className={styles.checkboxField}>
                          <input
                            type="radio"
                            name={`pay-choice-${booking.id}`}
                            checked={payInFull}
                            onChange={() => setPayInFull(true)}
                          />
                          <span>
                            Pay in full ({formatPeso(booking.total_price)})
                          </span>
                        </label>
                        <label className={styles.checkboxField}>
                          <input
                            type="radio"
                            name={`pay-choice-${booking.id}`}
                            checked={!payInFull}
                            onChange={() => setPayInFull(false)}
                          />
                          <span>
                            Pay downpayment only (
                            {formatPeso(booking.downpayment_amount)})
                          </span>
                        </label>
                      </fieldset>
                    ) : (
                      <p className={styles.copy}>
                        Amount due:{' '}
                        {formatPeso(
                          booking.payment_stage === 'Paid in Advance'
                            ? booking.total_price -
                                (booking.downpayment_amount ?? 0)
                            : booking.total_price
                        )}
                      </p>
                    )}

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Payment method</span>
                      <select
                        className={styles.input}
                        value={payPaymentMethod}
                        onChange={(event) =>
                          setPayPaymentMethod(
                            event.target.value as 'GCash' | 'Maya'
                          )
                        }
                      >
                        <option value="GCash">GCash</option>
                        <option value="Maya">Maya</option>
                      </select>
                    </label>

                    {actionError ? (
                      <p className={styles.errorBanner} role="alert">
                        {actionError}
                      </p>
                    ) : null}

                    <div className={styles.bookingControls}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={isSubmittingAction}
                        onClick={() => void confirmPay(booking)}
                      >
                        {isSubmittingAction
                          ? 'Redirecting...'
                          : 'Continue to payment'}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={closeAction}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {isRescheduling ? (
                  <div className={styles.actionPanel}>
                    <SlotPicker
                      accessToken={accessToken}
                      branchId={booking.branch_id}
                      serviceCategory={booking.service_category}
                      slotDurationMinutes={durationMinutes}
                      petWeightClass={petWeightClass}
                      viewerMode="customer"
                      selectedSlot={rescheduleSlot}
                      onSelect={setRescheduleSlot}
                    />

                    {showStaffPicker && rescheduleSlot ? (
                      <StaffPickerList
                        accessToken={accessToken}
                        branchId={booking.branch_id}
                        serviceCategory={
                          booking.service_category as 'Grooming' | 'Veterinary'
                        }
                        scheduledStart={rescheduleSlot.start}
                        scheduledEnd={rescheduleSlot.end}
                        selected={rescheduleStaffPreference}
                        onSelect={setRescheduleStaffPreference}
                        onUnavailable={() => setStaffPickerUnavailable(true)}
                      />
                    ) : null}

                    {actionError ? (
                      <p className={styles.errorBanner} role="alert">
                        {actionError}
                      </p>
                    ) : null}

                    <div className={styles.bookingControls}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={!rescheduleSlot || isSubmittingAction}
                        onClick={() => void confirmReschedule(booking)}
                      >
                        {isSubmittingAction
                          ? 'Rescheduling...'
                          : 'Confirm new time'}
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={closeAction}
                      >
                        Cancel reschedule
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        isOpen={cancelTarget !== undefined}
        title="Cancel this booking?"
        tone="danger"
        confirmLabel="Yes, cancel booking"
        cancelLabel="Keep booking"
        isConfirming={isSubmittingAction}
        onCancel={closeAction}
        onConfirm={() => {
          if (cancelTarget) void confirmCancel(cancelTarget);
        }}
        body={
          <>
            <p>
              Are you sure you want to cancel this booking? This cannot be
              undone
              {cancelTarget?.downpayment_amount
                ? ' and may forfeit your downpayment depending on notice given'
                : ''}
              .
            </p>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Reason (optional)</span>
              <textarea
                className={styles.input}
                value={cancellationReason}
                onChange={(event) => setCancellationReason(event.target.value)}
              />
            </label>
            {actionError ? (
              <p className={styles.errorBanner} role="alert">
                {actionError}
              </p>
            ) : null}
          </>
        }
      />
    </main>
  );
}
