import { useEffect, useMemo, useState } from 'react';
import { useNowMs } from '../../../../shared/hooks/useNowMs/useNowMs';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { useCreditBalance } from '../../../credits/providers/useCreditBalance';
import { notifyCreditBalanceChanged } from '../../../credits/providers/creditBalanceEvents';
import { listCustomerPets } from '../../../customers/api/customer.api';
import type { Pet } from '../../../customers/customer.types';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { BookingConfirmationBadge } from '../../components/shared/BookingConfirmationBadge/BookingConfirmationBadge';
import { SlotPicker } from '../../components/SlotPicker/SlotPicker';
import { StaffPickerList } from '../../components/StaffPickerList/StaffPickerList';
import {
  cancelBooking,
  listBookings,
  rescheduleBooking,
} from '../../api/booking.api';
import {
  CANCELLABLE_BOOKING_STATUSES,
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

type ActiveAction = {
  bookingId: string;
  type: 'reschedule' | 'cancel';
};

/**
 * Issue #59: the customer's own bookings, with reschedule (re-entering the
 * Slot/Staff Picker scoped to the existing booking, per dev notes - not a
 * full re-entry of the 8-step flow) and cancel (behind an explicit confirm
 * step, AC-5).
 *
 * Payment/transactions rework: paying for a booking moved out of here
 * entirely - it now lives on the Transaction History page
 * (`/portal/transactions`), per transaction. Reschedule and Cancel are the
 * only actions here, tucked behind a "..." menu.
 */
export function CustomerBookingsPage() {
  const { user, accessToken } = useAuth();
  const { refresh: refreshCreditBalance } = useCreditBalance();
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

  function closeAction() {
    setActiveAction(null);
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
    if (result.data.credit_issued) {
      // Pull the new balance so the navbar credit pill (and the portal home)
      // reflect the just-issued credit without a page reload - both via the
      // context and the global event, since the pill has been flaky.
      refreshCreditBalance();
      notifyCreditBalanceChanged();
    }
    const branchName = branchNameById.get(booking.branch_id) ?? 'this branch';
    setActionMessage(
      result.data.credit_issued
        ? `Booking cancelled. Your payment has been converted into account credit at ${branchName} for a future visit.`
        : result.data.policy_violation
          ? 'Booking cancelled. This did not meet the required notice period, so any payment was forfeited.'
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
  // stray/double click on the row's "Cancel" menu item opens it, it never
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
            const isRescheduling =
              activeAction?.bookingId === booking.id &&
              activeAction.type === 'reschedule';
            const isCancelling =
              activeAction?.bookingId === booking.id &&
              activeAction.type === 'cancel';

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

            const menuItems = [
              ...(canReschedule
                ? [
                    {
                      label: 'Reschedule',
                      onSelect: () => openReschedule(booking),
                    },
                  ]
                : []),
              ...(canCancel
                ? [{ label: 'Cancel', onSelect: () => openCancel(booking) }]
                : []),
            ];

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

                {menuItems.length > 0 && !isRescheduling && !isCancelling ? (
                  <MoreOptionsMenu
                    label={`Options for this ${booking.service_category} booking`}
                    items={menuItems}
                  />
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
        confirmLabel="Yes, cancel"
        cancelLabel="Keep booking"
        isConfirming={isSubmittingAction}
        onCancel={closeAction}
        onConfirm={() => {
          if (cancelTarget) void confirmCancel(cancelTarget);
        }}
        body={
          <>
            <p>
              Are you sure you want to cancel this booking? This can&apos;t be
              undone.
            </p>
            {cancelTarget?.payment_status === 'Fully Paid' ||
            cancelTarget?.payment_status === 'Partially Paid' ? (
              <p>
                Any payment you&apos;ve already made &mdash; a down payment or
                the full amount &mdash; won&apos;t be refunded. If you cancel
                with enough notice it becomes <strong>account credit</strong> at
                this branch that you can use on a future visit; a late
                cancellation forfeits it.
              </p>
            ) : null}
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
