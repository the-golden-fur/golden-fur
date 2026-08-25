import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { SlotPicker } from '../../../booking/components/SlotPicker/SlotPicker';
import { StaffPickerList } from '../../../booking/components/StaffPickerList/StaffPickerList';
import { createBooking, getBookingCatalog } from '../../../booking/api/booking.api';
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

/** Matches CustomerBookingFlowPage's own DEFAULT_DURATION_MINUTES.Veterinary
 * stand-in - a fixed duration for the availability check before any
 * service is chosen, replaced with the real item duration at submit time
 * (below). */
const STAND_IN_DURATION_MINUTES = 60;

export interface ScheduleFollowUpModalProps {
  accessToken: string;
  consultationId: string;
  petId: string;
  petName: string;
  customerId: string;
  ownerName: string;
  branchId: string;
  /** Prefills the special instructions field - carried over from the
   * originating consultation's booking, still editable. */
  originalSpecialInstructions: string | null;
  onClose: () => void;
  /** Fired once the booking is created and linked, right before navigating
   * to its receipt page - lets the caller update its own consultations list
   * without waiting for the next queue poll. */
  onLinked: (consultation: Consultation) => void;
}

/**
 * Opens the real booking-creation pipeline (same createBooking() a
 * receptionist walk-in uses - see booking.service.ts's createBooking, which
 * has no role restriction beyond being staff) in a single-page modal, with
 * pet/owner/branch/category locked in from the originating consultation and
 * only the (Veterinary-only) service left to actively pick - no packages,
 * since a package isn't category-scoped and could pull in non-Veterinary
 * services. Confirming creates the
 * booking, links it onto the consultation as its follow-up (server-side
 * linkFollowUpBooking), and redirects to the booking's existing receipt page
 * (BookingDetailsPage) - the customer is notified for free, since
 * createBooking already fires sendBookingConfirmedNotification on every
 * successful booking.
 */
export function ScheduleFollowUpModal({
  accessToken,
  consultationId,
  petId,
  petName,
  customerId,
  ownerName,
  branchId,
  originalSpecialInstructions,
  onClose,
  onLinked,
}: ScheduleFollowUpModalProps) {
  const navigate = useNavigate();

  const [branchName, setBranchName] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null
  );
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [staffPreference, setStaffPreference] =
    useState<StaffPreferenceInput | null>(null);
  const [staffPickerUnavailable, setStaffPickerUnavailable] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState(
    originalSpecialInstructions ?? ''
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void listBranches().then((result) => {
      if (!isMounted || !result.data) return;
      const branch = result.data.find((entry) => entry.id === branchId);
      setBranchName(branch?.name ?? null);
    });

    // category: 'Veterinary' filters server-side (catalog.service.ts's
    // listServices) - packages aren't category-scoped the same way (a
    // package can bundle services across categories), so this only ever
    // reads .services, never .packages, to keep the vet limited to actual
    // Veterinary services.
    void getBookingCatalog(accessToken, {
      branchId,
      category: 'Veterinary',
    }).then((result) => {
      if (!isMounted) return;
      if (!result.data) {
        setCatalogError(result.error ?? 'Could not load services.');
        return;
      }
      setServices(result.data.services);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, branchId]);

  const durationMinutes = useMemo(() => {
    if (!selectedServiceId) return STAND_IN_DURATION_MINUTES;
    const service = services.find((entry) => entry.id === selectedServiceId);
    return service?.duration_minutes ?? STAND_IN_DURATION_MINUTES;
  }, [selectedServiceId, services]);

  const canSubmit = selectedServiceId !== null && selectedSlot !== null;

  async function handleConfirm() {
    if (!selectedServiceId || !selectedSlot) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const scheduledEnd = new Date(
      new Date(selectedSlot.start).getTime() + durationMinutes * 60000
    ).toISOString();

    try {
      const bookingResult = await createBooking(accessToken, {
        customer_id: customerId,
        pet_id: petId,
        branch_id: branchId,
        service_category: 'Veterinary',
        items: [{ service_id: selectedServiceId }],
        scheduled_start: selectedSlot.start,
        scheduled_end: scheduledEnd,
        ...(staffPreference ? { staff_preference: staffPreference } : {}),
        ...(specialInstructions.trim()
          ? { special_instructions: specialInstructions.trim() }
          : {}),
      });

      if (bookingResult.error || !bookingResult.data) {
        setSubmitError(
          bookingResult.error ?? 'Could not create the follow-up booking.'
        );
        return;
      }

      const newBooking = bookingResult.data;

      const linkResult = await linkFollowUpBooking(
        consultationId,
        accessToken,
        newBooking.id
      );

      if (linkResult.data) {
        onLinked(linkResult.data.consultation);
      }
      // A link failure here doesn't undo the booking - the follow-up was
      // still successfully scheduled, so still route to its receipt rather
      // than stranding the vet on a modal with no obvious retry action.

      onClose();
      navigate(`/staff/bookings/${newBooking.id}`);
    } catch {
      setSubmitError(
        'Could not reach the server. Check your connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen
      title="Schedule Follow-up"
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
            <span className={styles.fieldLabel}>Category</span>
            <span>Veterinary</span>
          </div>
        </div>

        {catalogError ? (
          <p className={styles.errorBanner} role="alert">
            {catalogError}
          </p>
        ) : null}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Service</span>
          <select
            className={styles.input}
            value={selectedServiceId ?? ''}
            onChange={(event) =>
              setSelectedServiceId(event.target.value || null)
            }
          >
            <option value="">Select a service...</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} (₱{service.base_price.toFixed(2)})
              </option>
            ))}
          </select>
        </label>

        <SlotPicker
          accessToken={accessToken}
          branchId={branchId}
          serviceCategory="Veterinary"
          slotDurationMinutes={STAND_IN_DURATION_MINUTES}
          viewerMode="staff"
          selectedSlot={selectedSlot}
          onSelect={setSelectedSlot}
        />

        {selectedSlot && !staffPickerUnavailable ? (
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

        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            Special instructions (optional)
          </span>
          <textarea
            className={styles.input}
            value={specialInstructions}
            onChange={(event) => setSpecialInstructions(event.target.value)}
          />
        </label>

        {submitError ? (
          <p className={styles.errorBanner} role="alert">
            {submitError}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canSubmit || isSubmitting}
            onClick={() => void handleConfirm()}
          >
            {isSubmitting ? 'Scheduling...' : 'Confirm'}
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
