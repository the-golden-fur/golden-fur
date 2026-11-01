import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as frontDeskApi from '../../api/frontDesk.api';
import { getStaffProfile } from '../../../staff/api/staff.api';
import type { FrontDeskQueueRow } from '../../frontDesk.types';
import { FrontDeskQueuePage } from './FrontDeskQueuePage';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: () => ({ user: { id: 'staff-1' }, accessToken: 'token' }),
}));
vi.mock('../../../staff/api/staff.api', () => ({ getStaffProfile: vi.fn() }));
vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn().mockResolvedValue({ data: [], error: null }),
  getPetWeightClassConfiguration: vi
    .fn()
    .mockResolvedValue({ data: null, error: null }),
}));
vi.mock('../../../veterinary/api/veterinary.api', () => ({
  listServiceCatalog: vi.fn().mockResolvedValue({ data: [], error: null }),
}));
vi.mock('../../api/frontDesk.api', () => ({
  listFrontDeskQueue: vi.fn(),
  startFrontDeskBooking: vi.fn(),
  completeFrontDeskBooking: vi.fn(),
}));

function row(
  id: string,
  petName: string,
  booking: Partial<FrontDeskQueueRow['booking']>
): FrontDeskQueueRow {
  return {
    booking: {
      id,
      branch_id: 'branch-1',
      status: 'In Progress',
      service_category: 'Grooming',
      booking_source: 'Walk-in',
      payment_status: 'Fully Paid',
      awaiting_assessment: false,
      scheduled_start: '2026-11-01T02:00:00Z',
      pet_id: `pet-${id}`,
      ...booking,
    } as FrontDeskQueueRow['booking'],
    pet_name: petName,
    owner_name: 'Sam',
    assigned_staff_name: 'Ana',
    completed_by_name: null,
    stay_id: null,
    outstanding_task_count: 0,
  };
}

function setProfile(role: string) {
  vi.mocked(getStaffProfile).mockResolvedValue({
    data: { role, branch_id: 'branch-1' },
    error: null,
  } as never);
}

function renderPage() {
  render(
    <MemoryRouter>
      <FrontDeskQueuePage />
    </MemoryRouter>
  );
}

describe('FrontDeskQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setProfile('Front Desk');
    vi.mocked(frontDeskApi.listFrontDeskQueue).mockResolvedValue({
      data: [
        row('groom', 'Mochi', {}),
        row('vet', 'Biscuit', { service_category: 'Veterinary' }),
        row('done', 'Rex', { status: 'Completed' }),
      ],
      error: null,
    });
    vi.mocked(frontDeskApi.completeFrontDeskBooking).mockResolvedValue({
      data: true,
      error: null,
    });
  });

  it('never loads the queue for a role outside the gate', async () => {
    setProfile('Groomer');
    renderPage();

    await waitFor(() => expect(getStaffProfile).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText('Front Desk Queue')).not.toBeInTheDocument()
    );
    expect(frontDeskApi.listFrontDeskQueue).not.toHaveBeenCalled();
  });

  it('lists mixed services and hides finished rows by default', async () => {
    renderPage();

    expect(await screen.findByText('Mochi')).toBeInTheDocument();
    expect(screen.getByText('Biscuit')).toBeInTheDocument();
    expect(screen.queryByText('Rex')).not.toBeInTheDocument();
  });

  it('links each row to its booking details', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Mochi' })).toHaveAttribute(
      'href',
      '/staff/bookings/groom?from=front-desk'
    );
  });

  it('completes a grooming only after confirming', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Complete Mochi' })
    );
    expect(frontDeskApi.completeFrontDeskBooking).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Complete' }));

    await waitFor(() =>
      expect(frontDeskApi.completeFrontDeskBooking).toHaveBeenCalledWith(
        'groom',
        'token'
      )
    );
  });

  it('opens the services dialog for a vet visit instead of completing it', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Complete Biscuit' })
    );

    expect(
      await screen.findByText('Services done for Biscuit')
    ).toBeInTheDocument();
    expect(frontDeskApi.completeFrontDeskBooking).not.toHaveBeenCalled();
  });
});
