import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../api/staff.api';
import type { StaffProfile } from '../../staff.types';
import {
  listPendingVaccinationRecords,
  reviewVaccinationRecord,
} from '../../../customers/api/customer.api';
import type { PendingVaccinationRecord } from '../../../customers/customer.types';
import { VaccinationReviewPage } from './VaccinationReviewPage';

vi.mock('../../api/staff.api', () => ({
  listStaff: vi.fn(),
}));
vi.mock('../../../customers/api/customer.api', () => ({
  listPendingVaccinationRecords: vi.fn(),
  reviewVaccinationRecord: vi.fn(),
}));

function mockViewer(role: StaffProfile['role']) {
  vi.mocked(staffApi.listStaff).mockResolvedValue({
    data: [
      {
        id: 'staff-1',
        branch_id: 'branch-a',
        role,
        username: 'staff1',
        registered_email: 'staff1@example.com',
        display_name: 'Staff One',
        profile_photo_url: null,
        phone_number: null,
        emergency_contact_name: null,
        emergency_contact_number: null,
        preferred_communication_channel: null,
        is_active: true,
        archived_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ],
    error: null,
  });
}

const PENDING: PendingVaccinationRecord = {
  id: 'record-1',
  pet_id: 'pet-1',
  vaccine_name: 'Anti-rabies',
  date_administered: '2026-07-01',
  next_due_date: '2027-07-01',
  administered_by: null,
  notes: null,
  created_at: '2026-10-20T02:00:00.000Z',
  status: 'pending',
  reported_by_customer_id: 'customer-1',
  reviewed_at: null,
  rejection_reason: null,
  proof_url: 'https://signed/card.jpg',
  pet_name: 'Bantay',
  owner_name: 'Jane Doe',
};

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'staff1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/',
            element: createElement(VaccinationReviewPage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('div', null, 'Staff settings page'),
          })
        )
      )
    )
  );
}

describe('VaccinationReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPendingVaccinationRecords).mockResolvedValue({
      data: [PENDING],
      error: null,
    });
  });

  it('redirects a role that cannot review vaccinations', async () => {
    mockViewer('Groomer');

    renderPage();

    expect(await screen.findByText('Staff settings page')).toBeInTheDocument();
  });

  it('lists pending records with the pet, owner and card', async () => {
    mockViewer('Receptionist');

    renderPage();

    expect(await screen.findByText('Anti-rabies')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bantay' })).toHaveAttribute(
      'href',
      '/staff/pets/pet-1'
    );
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open the vaccination card for Bantay/ })
    ).toHaveAttribute('href', 'https://signed/card.jpg');
  });

  it('verifying a record takes it off the queue', async () => {
    mockViewer('Veterinarian');
    vi.mocked(reviewVaccinationRecord).mockResolvedValue({
      data: { ...PENDING, status: 'verified' },
      error: null,
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Verify' }));

    expect(
      await screen.findByText(/Bantay's Anti-rabies verified/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Anti-rabies')).not.toBeInTheDocument();
    expect(
      screen.getByText('Nothing to review right now.')
    ).toBeInTheDocument();
  });
});
