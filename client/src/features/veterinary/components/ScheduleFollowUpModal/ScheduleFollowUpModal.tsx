import { useEffect, useState } from 'react';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { SlotPicker } from '../../../booking/components/SlotPicker/SlotPicker';
import { StaffPickerList } from '../../../booking/components/StaffPickerList/StaffPickerList';
import {
  createBooking,
  getBookingCatalog,
} from '../../../booking/api/booking.api';
import type { StaffPreferenceInput } from '../../../booking/booking.types';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { Service } from '../../../maintenance/maintenance.types';
import { linkFollowUpBooking } from '../../api/veterinary.api';
import type { Consultation } from '../../veterinary.types';
import styles from './ScheduleFollowUpModal.module.css';

interface SelectedSlot {
  start: string;
  end: string;
}

/** The fixed, free Veterinary service a follow-up is booked as (migration
 * 20261006250). Found by name in the branch's own booking catalog, so a
 * branch where an admin has switched it off simply can't schedule one. */
const FOLLOW_UP_SERVICE_NAME = 'Follow-up Consultation';

/** Used for the slot grid until the service's own duration has loaded. */
const DEFAULT_DURATION_MINUTES = 45;

export interface ScheduleFollowUpModalProps {
  accessToken: string;
  consultationId: string;
  petId: string;
  petName: string;
  customerId: string;
  ownerName: string;
  branchId: string;
  /** The vet scheduling the follow-up - who it is booked with unless they
   * pick someone else in the staff picker. */
  veterinarianId: string;
  onClose: () => void;
  /** Fired once the booking is created and linked, with the originating
   * consultation as it now reads (follow-up date + reason set) - lets the
   * caller update its own list without waiting for the next queue poll. */
  onLinked: (consultation: Consultation) => void;
}

/**
 * Vet-priced visits: the vet's own "bring this pet back" form, opened from a
 * Completed consultation. Restored from the earlier ScheduleFollowUpModal
 * (removed in vet-bookings-queue-access) and narrowed: the service is no
 * longer chosen - a follow-up is always the free "Follow-up Consultation",
 * whose actual charges the vet lists when that visit is completed - and the
 * vet must say WHY the pet is coming back.
 *
 * Confirming goes through the real booking pipeline (the same createBooking()
 * a receptionist walk-in uses, so capacity, staff availability and the
 * customer's booking-confirmed notification all apply), then links the new
 * booking onto this consultation with the reason (server-side
 * linkFollowUpBooking). The reason is also the new booking's special
 * instructions, which become that visit's "Reason" when the pet returns.
 */
export function ScheduleFollowUpModal({
  accessToken,
  consultationId,
  petId,
  petName,
  customerId,
  ownerName,
  branchId,
  veterinarianId,
  onClose,
  onLinked,
}: ScheduleFollowUpModalProps) {
  const [branchName, setBranchName] = useState<string | null>(null);
  // undefined = still loading; null = this branch doesn't offer it.
  const [service, setService] = useState<Service | null | undefined>(undefined);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [staffPreference, setStaffPreference] = useState<StaffPreferenceInput>({
    type: 'specific',
    staff_id: veterinarianId,
  });
  const [staffPickerUnavailable, setStaffPickerUnavailable] = useState(false);
  const [reason, setReason] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set once the booking exists, so a retry after a failed link only links -
  // it never books the same follow-up twice.
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void listBranches().then((result) => {
      if (!isMounted || !result.data) return;
      const branch = result.data.find((entry) => entry.id === branchId);
      setBranchName(branch?.name ?? null);
    });

    void getBookingCatalog(accessToken, {
      branchId,
      category: 'Veterinary',
    }).then((result) => {
      if (!isMounted) return;
      if (!result.data) {
        setCatalogError(result.error ?? 'Could not load services.');
        setService(null);
        return;
      }
      setService(
        result.data.services.find(
          (entry) => entry.name === FOLLOW_UP_SERVICE_NAME
        ) ?? null
      );
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, branchId]);

  const durationMinutes = service?.duration_minutes ?? DEFAULT_DURATION_MINUTES;
  const trimmedReason = reason.trim();
  const canSubmit =
    Boolean(service) && selectedSlot !== null && trimmedReason !== '';

  const serviceProblem =
    catalogError ??
    (service === null
      ? `The ${FOLLOW_UP_SERVICE_NAME} service isn't offered at this branch, so a follow-up can't be scheduled here. An admin can enable it in Services.`
      : null);

  async function handleConfirm() {
    if (!service || !selectedSlot || trimmedReason === '') return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      let bookingId = createdBookingId;

      if (!bookingId) {
        const scheduledEnd = new Date(
          new Date(selectedSlot.start).getTime() + durationMinutes * 60000
        ).toISOString();

        const bookingResult = await createBooking(accessToken, {
          customer_id: customerId,
          pet_id: petId,
          branch_id: branchId,
          service_category: 'Veterinary',
          items: [{ service_id: service.id }],
          scheduled_start: selectedSlot.start,
          scheduled_end: scheduledEnd,
          staff_preference: staffPreference,
          special_instructions: trimmedReason,
        });

        if (bookingResult.error || !bookingResult.data) {
          setSubmitError(
            bookingResult.error ?? 'Could not create the follow-up booking.'
          );
          return;
        }

        bookingId = bookingResult.data.id;
        setCreatedBookingId(bookingId);
      }

      const linkResult = await linkFollowUpBooking(
        consultationId,
        accessToken,
        {
          booking_id: bookingId,
          reason: trimmedReason,
        }
      );

      if (linkResult.error || !linkResult.data) {
        setSubmitError(
          `The follow-up was booked, but it could not be linked to this visit (${linkResult.error ?? 'unknown error'}). Press Schedule follow-up again to retry - it will not be booked twice.`
        );
        return;
      }

      onLinked(linkResult.data.consultation);
      onClose();
    } catch {
      setSubmitError(
        'Could not reach the server. Check your connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const shownError = submitError ?? serviceProblem;

  return (
    <Modal
      isOpen
      title="Schedule follow-up"
      onClose={onClose}
      closeOnBackdropClick={false}
    >
      <div className={styles.body}>
        <div className={styles.lockedSummary}>
          <div className={styles.lockedField}>
            <span className={styles.fieldLabel}>Pet</span>
            <span>{petName}</span>
          </div>
          <div className={styles.lockedField}>
            <span className={styles.fieldLabel}>Owner</span>
            <span>{ownerName}</span>
          </div>
          <div className={styles.lockedField}>
            <span className={styles.fieldLabel}>Branch</span>
            <span>{branchName ?? '...'}</span>
          </div>
          <div className={styles.lockedField}>
            <span className={styles.fieldLabel}>Service</span>
            <span>
              {service
                ? `${service.name} (${formatCurrency(service.base_price)})`
                : service === undefined
                  ? '...'
                  : FOLLOW_UP_SERVICE_NAME}
            </span>
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Reason for follow-up</span>
          <textarea
            className={styles.input}
            rows={3}
            required
            placeholder="e.g. Recheck the ear after 7 days of drops"
            value={reason}
            disabled={createdBookingId !== null}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>

        {createdBookingId === null ? (
          <SlotPicker
            accessToken={accessToken}
            branchId={branchId}
            serviceCategory="Veterinary"
            slotDurationMinutes={durationMinutes}
            viewerMode="staff"
            selectedSlot={selectedSlot}
            onSelect={setSelectedSlot}
          />
        ) : null}

        {createdBookingId === null &&
        selectedSlot &&
        !staffPickerUnavailable ? (
          <StaffPickerList
            accessToken={accessToken}
            branchId={branchId}
            serviceCategory="Veterinary"
            scheduledStart={selectedSlot.start}
            scheduledEnd={selectedSlot.end}
            selected={staffPreference}
            onSelect={setStaffPreference}
            onUnavailable={() => setStaffPickerUnavailable(true)}
          />
        ) : null}

        {shownError ? (
          <p className={styles.errorBanner} role="alert">
            {shownError}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canSubmit || isSubmitting}
            onClick={() => void handleConfirm()}
          >
            {isSubmitting ? 'Scheduling...' : 'Schedule follow-up'}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            disabled={isSubmitting}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
