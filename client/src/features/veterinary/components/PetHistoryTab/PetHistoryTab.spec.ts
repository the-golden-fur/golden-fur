import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { PetHistoryTab } from './PetHistoryTab';
import type { Consultation } from '../../veterinary.types';

function buildConsultation(overrides: Partial<Consultation> = {}): Consultation {
  return {
    id: 'c-1',
    booking_id: 'booking-1',
    pet_id: 'pet-1',
    veterinarian_id: 'vet-1',
    status: 'Completed',
    temperature: null,
    weight: null,
    heart_rate: null,
    respiratory_rate: null,
    diagnosis: 'Ear infection',
    medications: [{ name: 'Amoxicillin', dose: '50mg', notes: null }],
    reason_for_visit: 'Annual checkup',
    follow_up_date: null,
    follow_up_booking_id: null,
    completed_at: '2026-07-19T00:00:00.000Z',
    created_at: '2026-07-19T00:00:00.000Z',
    updated_at: '2026-07-19T00:00:00.000Z',
    ...overrides,
  };
}

describe('PetHistoryTab (#70)', () => {
  it('AC-3: shows an empty state when there is no prior history', () => {
    render(
      createElement(PetHistoryTab, {
        consultations: [],
        isLoading: false,
        error: null,
      })
    );

    expect(
      screen.getByText('No prior consultations for this pet.')
    ).toBeInTheDocument();
  });

  it('AC-3: lists prior consultations with diagnosis and medications', () => {
    render(
      createElement(PetHistoryTab, {
        consultations: [buildConsultation()],
        isLoading: false,
        error: null,
      })
    );

    expect(screen.getByText('Annual checkup')).toBeInTheDocument();
    expect(screen.getByText(/Ear infection/)).toBeInTheDocument();
    expect(screen.getByText(/Amoxicillin/)).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    render(
      createElement(PetHistoryTab, {
        consultations: [],
        isLoading: true,
        error: null,
      })
    );

    expect(screen.getByText('Loading pet history...')).toBeInTheDocument();
  });
});
