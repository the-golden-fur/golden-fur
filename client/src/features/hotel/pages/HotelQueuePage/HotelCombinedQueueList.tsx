import type { Booking } from '../../../booking/booking.types';
import { HotelBookingPicker } from '../../components/HotelBookingPicker/HotelBookingPicker';
import type { CareLogEntry } from '../../hotel.types';
import styles from './HotelQueuePage.module.css';

interface HotelCombinedQueueListProps {
  accessToken: string;
  branchId: string | null;
  careLogEntries: CareLogEntry[];
  onViewChecklist: (stayId: string) => void;
  onMarkChanged: () => void;
  onViewDetails: (booking: Booking) => void;
}

/**
 * Custom change (Groomer/Pet Assistant check-in restriction): Groomer and
 * Pet Assistant can no longer check pets in/out (server now 403s those two
 * routes for them), so HotelQueuePage renders this instead of its
 * Check-In/Check-Out tabs for those two roles - one list of every stay
 * regardless of status, every action reached through HotelBookingPicker's
 * own "..." menu (View booking details / View checklist items / Mark as in
 * progress-done). No checkout affordance is offered here at all.
 */
export function HotelCombinedQueueList({
  accessToken,
  branchId,
  careLogEntries,
  onViewChecklist,
  onMarkChanged,
  onViewDetails,
}: HotelCombinedQueueListProps) {
  if (!branchId) return null;

  return (
    <section>
      <h2 className={styles.sectionTitle}>Hotel queue</h2>
      <HotelBookingPicker
        accessToken={accessToken}
        branchId={branchId}
        onCheckIn={() => {}}
        onViewDetails={onViewDetails}
        selectedBookingId={null}
        careLogEntries={careLogEntries}
        onViewChecklist={onViewChecklist}
        onMarkChanged={onMarkChanged}
        showAllStatuses
      />
    </section>
  );
}
