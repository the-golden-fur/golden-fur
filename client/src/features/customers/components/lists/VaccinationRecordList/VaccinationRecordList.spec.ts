import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVaccinationRecord,
  listVaccinationRecords,
  reviewVaccinationRecord,
} from '../../../api/customer.api';
import type { PetVaccinationRecord } from '../../../customer.types';
import {
  VaccinationRecordList,
  type VaccinationRecordListMode,
} from './VaccinationRecordList';

vi.mock('../../../api/customer.api', () => ({
  listVaccinationRecords: vi.fn(),
  createVaccinationRecord: vi.fn(),
  updateVaccinationRecord: vi.fn(),
  deleteVaccinationRecord: vi.fn(),
  reviewVaccinationRecord: vi.fn(),
}));

function buildRecord(
  overrides: Partial<PetVaccinationRecord> = {}
): PetVaccinationRecord {
  return {
    id: 'record-1',
    pet_id: 'pet-1',
    vaccine_name: 'Rabies',
    date_administered: '2026-07-01',
    next_due_date: null,
    administered_by: 'staff-1',
    notes: null,
    created_at: '2026-07-01T00:00:00.000Z',
    status: 'verified',
    reported_by_customer_id: null,
    reviewed_at: '2026-07-01T00:00:00.000Z',
    rejection_reason: null,
    proof_url: null,
    ...overrides,
  };
}

function renderList(
  records: PetVaccinationRecord[],
  mode?: VaccinationRecordListMode
) {
  vi.mocked(listVaccinationRecords).mockResolvedValue({
    data: records,
    error: null,
  });

  return render(
    createElement(VaccinationRecordList, {
      petId: 'pet-1',
      accessToken: 'token',
      mode,
    })
  );
}

const OWNERS_PENDING = buildRecord({
  id: 'record-owner',
  vaccine_name: 'Kennel cough',
  status: 'pending',
  administered_by: null,
  reported_by_customer_id: 'customer-1',
  reviewed_at: null,
  proof_url: 'https://signed/card.jpg',
});

describe('VaccinationRecordList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-5: renders each record with vaccine name and date administered', async () => {
    renderList([buildRecord()]);

    expect(await screen.findByText('Rabies')).toBeInTheDocument();
    expect(screen.getByText('Administered 2026-07-01')).toBeInTheDocument();
  });

  it('renders an empty state when there are no records', async () => {
    renderList([]);

    expect(
      await screen.findByText('No vaccination records yet.')
    ).toBeInTheDocument();
  });

  it('shows whether the clinic has verified each record, and the rejection reason', async () => {
    renderList([
      buildRecord(),
      OWNERS_PENDING,
      buildRecord({
        id: 'record-rejected',
        vaccine_name: 'Parvo',
        status: 'rejected',
        reported_by_customer_id: 'customer-1',
        rejection_reason: 'Card is unreadable',
      }),
    ]);

    expect(await screen.findByText('Verified by clinic')).toBeInTheDocument();
    expect(screen.getByText('Pending verification')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText(/Card is unreadable/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View card' })).toHaveAttribute(
      'href',
      'https://signed/card.jpg'
    );
  });

  it('read-only viewers get no add, edit or review controls', async () => {
    renderList([OWNERS_PENDING]);

    await screen.findByText('Kennel cough');
    expect(
      screen.queryByRole('button', { name: 'Add vaccination' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Verify' })
    ).not.toBeInTheDocument();
  });

  it("an owner can edit or delete only their own unverified records, and can't review", async () => {
    renderList([buildRecord(), OWNERS_PENDING], 'owner');

    const ownersItem = (await screen.findByText('Kennel cough')).closest('li')!;
    const clinicItem = screen.getByText('Rabies').closest('li')!;

    expect(
      within(ownersItem).getByRole('button', { name: 'Edit' })
    ).toBeInTheDocument();
    expect(
      within(ownersItem).getByRole('button', { name: 'Delete' })
    ).toBeInTheDocument();
    expect(
      within(clinicItem).queryByRole('button', { name: 'Edit' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Verify' })
    ).not.toBeInTheDocument();
  });

  it('an owner adds a vaccination with its card - it shows as pending', async () => {
    const user = userEvent.setup();
    renderList([], 'owner');
    vi.mocked(createVaccinationRecord).mockResolvedValue({
      data: OWNERS_PENDING,
      error: null,
    });

    await user.click(
      await screen.findByRole('button', { name: 'Add vaccination' })
    );
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Vaccine'), 'Kennel cough');
    await user.type(within(dialog).getByLabelText('Date given'), '2026-07-01');

    // The card is required from an owner.
    await user.click(
      within(dialog).getByRole('button', { name: 'Add vaccination' })
    );
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Add a photo of the vaccination card.'
    );
    expect(createVaccinationRecord).not.toHaveBeenCalled();

    const card = new File(['card'], 'card.jpg', { type: 'image/jpeg' });
    await user.upload(
      within(dialog).getByLabelText(/^Vaccination card photo/),
      card
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Add vaccination' })
    );

    expect(createVaccinationRecord).toHaveBeenCalledWith(
      'pet-1',
      'token',
      expect.objectContaining({
        vaccine_name: 'Kennel cough',
        date_administered: '2026-07-01',
        proof: card,
      })
    );
    expect(
      await screen.findByText(/The clinic will check your card/)
    ).toBeInTheDocument();
    expect(screen.getByText('Pending verification')).toBeInTheDocument();
  });

  it('staff can verify a pending record', async () => {
    const user = userEvent.setup();
    renderList([OWNERS_PENDING], 'staff');
    vi.mocked(reviewVaccinationRecord).mockResolvedValue({
      data: { ...OWNERS_PENDING, status: 'verified' },
      error: null,
    });

    await user.click(await screen.findByRole('button', { name: 'Verify' }));

    expect(reviewVaccinationRecord).toHaveBeenCalledWith(
      'pet-1',
      'record-owner',
      'token',
      { decision: 'verify' }
    );
    expect(await screen.findByText('Verified by clinic')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Verify' })
    ).not.toBeInTheDocument();
  });

  it('staff must give a reason to reject', async () => {
    const user = userEvent.setup();
    renderList([OWNERS_PENDING], 'staff');
    vi.mocked(reviewVaccinationRecord).mockResolvedValue({
      data: {
        ...OWNERS_PENDING,
        status: 'rejected',
        rejection_reason: 'Blurry photo',
      },
      error: null,
    });

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', {
      name: 'Reject record',
    });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox'), 'Blurry photo');
    await user.click(confirm);

    expect(reviewVaccinationRecord).toHaveBeenCalledWith(
      'pet-1',
      'record-owner',
      'token',
      { decision: 'reject', reason: 'Blurry photo' }
    );
    expect(await screen.findByText(/Blurry photo/)).toBeInTheDocument();
  });
});
