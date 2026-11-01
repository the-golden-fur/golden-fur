import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Booking } from '../../../booking/booking.types';
import { HotelCombinedQueueList } from './HotelCombinedQueueList';

// Custom change (Groomer/Pet Assistant check-in restriction): its own data
// fetching/menu-building is HotelBookingPicker.spec's job - this file only
// proves HotelCombinedQueueList passes the right props through (notably
// showAllStatuses) and handles a missing branchId gracefully.
vi.mock('../../components/HotelBookingPicker/HotelBookingPicker', () => ({
  HotelBookingPicker: (props: {
    branchId: string;
    showAllStatuses?: boolean;
    onCheckIn: (booking: Booking) => void;
  }) =>
    createElement(
      'div',
      null,
      `picker for branch ${props.branchId}, showAllStatuses=${String(props.showAllStatuses)}`
    ),
}));

describe('HotelCombinedQueueList', () => {
  it('renders HotelBookingPicker in showAllStatuses (menu-only) mode', () => {
    render(
      createElement(HotelCombinedQueueList, {
        accessToken: 'token',
        branchId: 'branch-1',
        careLogEntries: [],
        onViewChecklist: vi.fn(),
        onMarkChanged: vi.fn(),
        onViewDetails: vi.fn(),
      })
    );

    expect(
      screen.getByText('picker for branch branch-1, showAllStatuses=true')
    ).toBeInTheDocument();
  });

  it('renders nothing while branchId has not loaded yet', () => {
    const { container } = render(
      createElement(HotelCombinedQueueList, {
        accessToken: 'token',
        branchId: null,
        careLogEntries: [],
        onViewChecklist: vi.fn(),
        onMarkChanged: vi.fn(),
        onViewDetails: vi.fn(),
      })
    );

    expect(container).toBeEmptyDOMElement();
  });
});
