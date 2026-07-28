import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { BookingStatusBadge } from './BookingStatusBadge';
import type { BookingStatus } from '../../../booking.types';

describe('BookingStatusBadge', () => {
  const statuses: BookingStatus[] = [
    'Pending',
    'In Progress',
    'Completed',
    'Paid',
    'Cancelled',
    'No-show',
  ];

  it.each(statuses)('renders the %s status label', (status) => {
    render(createElement(BookingStatusBadge, { status }));
    expect(screen.getByText(status)).toBeInTheDocument();
  });
});
