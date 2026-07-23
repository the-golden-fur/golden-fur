import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppointmentCard } from './AppointmentCard';
import type { GroomingSession } from '../../grooming.types';

function buildSession(
  overrides: Partial<GroomingSession> = {}
): GroomingSession {
  return {
    id: 'session-1',
    booking_id: 'booking-1',
    assigned_groomer_id: 'groomer-1',
    status: 'Waiting',
    queue_position: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-07-19T00:00:00.000Z',
    updated_at: '2026-07-19T00:00:00.000Z',
    ...overrides,
  };
}

const baseProps = {
  petName: 'Buddy',
  ownerName: 'Jane Doe',
  breed: 'Golden Retriever',
  weightClass: 'M',
  coatType: 'LC',
  serviceLabel: 'Full Groom Package',
  addonLabels: ['Nail Trim'],
  specialInstructions: 'Puppy cut',
  isAdvancing: false,
};

describe('AppointmentCard (#68)', () => {
  it('AC-2: shows pet name, owner name, breed, size, coat type, service, add-ons, and instructions', () => {
    render(
      createElement(AppointmentCard, {
        ...baseProps,
        session: buildSession(),
        onAdvance: vi.fn(),
      })
    );

    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(screen.getByText(/Golden Retriever/)).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('LC')).toBeInTheDocument();
    expect(screen.getByText('Full Groom Package')).toBeInTheDocument();
    expect(screen.getByText(/Nail Trim/)).toBeInTheDocument();
    expect(screen.getByText(/Puppy cut/)).toBeInTheDocument();
  });

  it('AC-3: a Waiting session shows a "Mark In Progress" button that calls onAdvance', async () => {
    const onAdvance = vi.fn();
    render(
      createElement(AppointmentCard, {
        ...baseProps,
        session: buildSession({ status: 'Waiting' }),
        onAdvance,
      })
    );

    await userEvent.click(
      screen.getByRole('button', { name: /mark in progress/i })
    );

    expect(onAdvance).toHaveBeenCalledWith('session-1', 'In Progress');
  });

  it('AC-3: a Completed session shows no status-advance button', () => {
    render(
      createElement(AppointmentCard, {
        ...baseProps,
        session: buildSession({ status: 'Completed' }),
        onAdvance: vi.fn(),
      })
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
