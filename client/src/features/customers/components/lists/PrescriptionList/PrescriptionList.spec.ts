import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as customerApi from '../../../api/customer.api';
import type { PetPrescriptionHistoryEntry } from '../../../customer.types';
import { PrescriptionList } from './PrescriptionList';

vi.mock('../../../api/customer.api', () => ({
  listPetPrescriptions: vi.fn(),
}));

function buildEntry(
  overrides: Partial<PetPrescriptionHistoryEntry> = {}
): PetPrescriptionHistoryEntry {
  return {
    consultation_id: 'consultation-1',
    date: '2026-10-06T02:00:00.000Z',
    veterinarian_name: 'Dr. Reyes',
    branch_name: 'Golden Fur Makati',
    branch_address: '123 Ayala Ave, Makati',
    pet_name: 'Whiskers',
    owner_name: 'Jane Doe',
    medications: [
      {
        name: 'Amoxicillin',
        dose: '50mg',
        medicine_type: 'Oral',
        frequency: 'Twice daily',
        duration: '7 days',
        quantity: 14,
      },
    ],
    ...overrides,
  };
}

describe('PrescriptionList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.print = vi.fn();
  });

  it("shows each medicine's quantity and duration alongside its dose", async () => {
    vi.mocked(customerApi.listPetPrescriptions).mockResolvedValue({
      data: [buildEntry()],
      error: null,
    });

    render(
      createElement(PrescriptionList, { petId: 'pet-1', accessToken: 'token' })
    );

    expect(await screen.findByText(/Amoxicillin/)).toBeInTheDocument();
    expect(screen.getByText('Qty 14')).toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
  });

  it('prints the chosen prescription - and only that one - for taking to another pharmacy', async () => {
    vi.mocked(customerApi.listPetPrescriptions).mockResolvedValue({
      data: [
        buildEntry(),
        buildEntry({
          consultation_id: 'consultation-2',
          veterinarian_name: 'Dr. Santos',
          medications: [{ name: 'Meloxicam', dose: '1 tab' }],
        }),
      ],
      error: null,
    });

    render(
      createElement(PrescriptionList, { petId: 'pet-1', accessToken: 'token' })
    );

    const printButtons = await screen.findAllByRole('button', {
      name: 'Print prescription',
    });
    expect(printButtons).toHaveLength(2);

    await userEvent.click(printButtons[1]);

    const sheet = screen.getByRole('document', { name: 'Prescription' });
    expect(within(sheet).getByText('Meloxicam')).toBeInTheDocument();
    expect(within(sheet).getAllByText('Dr. Santos').length).toBeGreaterThan(0);
    expect(within(sheet).getByText('Whiskers')).toBeInTheDocument();
    expect(within(sheet).queryByText('Amoxicillin')).not.toBeInTheDocument();
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
