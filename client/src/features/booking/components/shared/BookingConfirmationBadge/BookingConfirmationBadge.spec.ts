import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { BookingConfirmationBadge } from './BookingConfirmationBadge';

const UNPAID_ONLINE = {
  status: 'Pending' as const,
  payment_status: 'Pending' as const,
  booking_source: 'Online' as const,
  service_category: 'Grooming' as const,
  cancellation_reason: null,
};

function renderBadge(
  booking: Parameters<typeof BookingConfirmationBadge>[0]['booking']
) {
  return render(createElement(BookingConfirmationBadge, { booking }));
}

// Book before assessment: an unpaid booking made for a pet staff have not
// assessed yet is waiting on the assessment, not on a late payment.
describe('BookingConfirmationBadge', () => {
  it('reads "Awaiting assessment" for an unpaid booking whose pet has not been assessed', () => {
    renderBadge({ ...UNPAID_ONLINE, awaiting_assessment: true });

    expect(screen.getByText('Awaiting assessment')).toBeInTheDocument();
    expect(screen.queryByText('Unconfirmed')).not.toBeInTheDocument();
  });

  it('still reads "Unconfirmed" for an ordinary unpaid booking', () => {
    renderBadge({ ...UNPAID_ONLINE, awaiting_assessment: false });

    expect(screen.getByText('Unconfirmed')).toBeInTheDocument();
  });

  it('goes back to the usual label once the booking is no longer unconfirmed', () => {
    renderBadge({
      ...UNPAID_ONLINE,
      payment_status: 'Fully Paid',
      awaiting_assessment: false,
    });

    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });
});
