import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { listVaccinationRecords } from '../../../api/customer.api';
import { VaccinationRecordList } from './VaccinationRecordList';

vi.mock('../../../api/customer.api', () => ({
  listVaccinationRecords: vi.fn(),
}));

describe('VaccinationRecordList', () => {
  it('AC-5: renders each record with vaccine name and date administered', async () => {
    vi.mocked(listVaccinationRecords).mockResolvedValue({
      data: [
        {
          id: 'record-1',
          pet_id: 'pet-1',
          vaccine_name: 'Rabies',
          date_administered: '2026-07-01',
          next_due_date: null,
          administered_by: 'staff-1',
          notes: null,
          created_at: '2026-07-01T00:00:00.000Z',
        },
      ],
      error: null,
    });

    render(
      createElement(VaccinationRecordList, {
        petId: 'pet-1',
        accessToken: 'token',
      })
    );

    expect(await screen.findByText('Rabies')).toBeInTheDocument();
    expect(screen.getByText('Administered 2026-07-01')).toBeInTheDocument();
  });

  it('renders an empty state when there are no records', async () => {
    vi.mocked(listVaccinationRecords).mockResolvedValue({
      data: [],
      error: null,
    });

    render(
      createElement(VaccinationRecordList, {
        petId: 'pet-1',
        accessToken: 'token',
      })
    );

    expect(
      await screen.findByText('No vaccination records yet.')
    ).toBeInTheDocument();
  });
});
