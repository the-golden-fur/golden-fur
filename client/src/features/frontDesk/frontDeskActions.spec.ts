import { describe, expect, it } from 'vitest';
import type { Booking } from '../booking/booking.types';
import type { FrontDeskQueueRow } from './frontDesk.types';
import { getRowActions } from './frontDeskActions';

const BRANCH = 'branch-1';

function makeRow(
  booking: Partial<Booking>,
  stayId: string | null = null
): FrontDeskQueueRow {
  return {
    booking: {
      id: 'b-1',
      branch_id: BRANCH,
      status: 'Pending',
      service_category: 'Grooming',
      booking_source: 'Walk-in',
      payment_status: 'Fully Paid',
      awaiting_assessment: false,
      ...booking,
    } as Booking,
    pet_name: 'Mochi',
    owner_name: 'Sam',
    assigned_staff_name: null,
    completed_by_name: null,
    stay_id: stayId,
    outstanding_task_count: 0,
  };
}

describe('getRowActions', () => {
  it.each(['Grooming', 'Veterinary'] as const)(
    'offers Start then Complete for %s',
    (service_category) => {
      expect(getRowActions(makeRow({ service_category }), BRANCH).action).toBe(
        'start'
      );
      expect(
        getRowActions(makeRow({ service_category, status: 'Late' }), BRANCH)
          .action
      ).toBe('start');
      expect(
        getRowActions(
          makeRow({ service_category, status: 'In Progress' }),
          BRANCH
        ).action
      ).toBe('complete');
    }
  );

  it.each(['Hotel', 'Daycare'] as const)(
    'offers Check In then Check Out for %s, never Complete',
    (service_category) => {
      expect(getRowActions(makeRow({ service_category }), BRANCH).action).toBe(
        'check-in'
      );
      expect(
        getRowActions(
          makeRow({ service_category, status: 'In Progress' }, 'stay-1'),
          BRANCH
        ).action
      ).toBe('check-out');
    }
  );

  it('still offers Check In to a walk-in that is In Progress with no stay', () => {
    expect(
      getRowActions(
        makeRow({ service_category: 'Hotel', status: 'In Progress' }),
        BRANCH
      ).action
    ).toBe('check-in');
  });

  it('asks for an assessment before anything else', () => {
    expect(
      getRowActions(
        makeRow({
          awaiting_assessment: true,
          booking_source: 'Online',
          payment_status: 'Pending',
        }),
        BRANCH
      ).action
    ).toBe('assess');
  });

  it('explains an unpaid online booking instead of offering Start', () => {
    expect(
      getRowActions(
        makeRow({ booking_source: 'Online', payment_status: 'Pending' }),
        BRANCH
      )
    ).toEqual({ action: null, blockedReason: 'Awaiting payment' });
  });

  it('offers nothing on a finished booking', () => {
    expect(
      getRowActions(makeRow({ status: 'Completed' }), BRANCH).action
    ).toBeNull();
  });

  it('blocks Hotel actions at another branch, since they are branch-bound', () => {
    expect(
      getRowActions(makeRow({ service_category: 'Hotel' }), 'other-branch')
    ).toEqual({ action: null, blockedReason: 'Other branch' });
  });
});
