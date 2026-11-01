import type { FrontDeskQueueRow, FrontDeskRowActions } from './frontDesk.types';

const NO_ACTION: FrontDeskRowActions = { action: null, blockedReason: null };

/** The one next step for a row. Hotel and Daycare start at check-in and end
 * at check-out, which is what closes the stay, bills it and frees the cage. */
export function getRowActions(
  { booking, stay_id: stayId }: FrontDeskQueueRow,
  viewerBranchId: string | null
): FrontDeskRowActions {
  const notStarted = booking.status === 'Pending' || booking.status === 'Late';
  const inProgress = booking.status === 'In Progress';

  if (!notStarted && !inProgress) return NO_ACTION;

  if (notStarted && booking.awaiting_assessment) {
    return { action: 'assess', blockedReason: null };
  }

  if (
    notStarted &&
    booking.booking_source === 'Online' &&
    booking.payment_status === 'Pending'
  ) {
    return { action: null, blockedReason: 'Awaiting payment' };
  }

  const category = booking.service_category;

  if (category === 'Hotel' || category === 'Daycare') {
    // Hotel check-in/out is bound to the staff member's own branch, so a
    // Superadmin looking at another branch can see the row but not act on it.
    if (category === 'Hotel' && booking.branch_id !== viewerBranchId) {
      return { action: null, blockedReason: 'Other branch' };
    }

    return { action: stayId ? 'check-out' : 'check-in', blockedReason: null };
  }

  if (category === 'Grooming' || category === 'Veterinary') {
    return { action: notStarted ? 'start' : 'complete', blockedReason: null };
  }

  return NO_ACTION;
}
