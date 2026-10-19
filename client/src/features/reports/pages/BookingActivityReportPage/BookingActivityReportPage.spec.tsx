import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile } from '../../../staff/staff.types';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as reportsApi from '../../api/reports.api';
import type { BookingActivityReport } from '../../reports.types';
import { currentReportDay } from '../../utils/reportDay';
import { BookingActivityReportPage } from './BookingActivityReportPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));
vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));
vi.mock('../../api/reports.api', () => ({
  getBookingActivityReport: vi.fn(),
}));

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
  { id: 'branch-southwoods', name: 'Southwoods', is_vet_branch: false },
];

function buildStaff(overrides: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-makati',
    role: 'Admin',
    username: 'admin1',
    registered_email: 'admin1@example.com',
    display_name: 'Admin One',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    archived_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildReport(
  overrides: Partial<BookingActivityReport> = {}
): BookingActivityReport {
  const today = currentReportDay();
  return {
    branch_id: 'branch-makati',
    date_from: today,
    date_to: today,
    totals: {
      total_bookings: 1,
      pending: 0,
      late: 0,
      checked_in: 1,
      checked_out: 1,
      no_show: 0,
      cancelled: 0,
    },
    records: [
      {
        id: 'bk-1',
        branch_id: 'branch-makati',
        customer_name: 'Ada Lovelace',
        pet_name: 'Mochi',
        service_category: 'Grooming',
        scheduled_start: `${today}T01:00:00.000Z`,
        scheduled_end: `${today}T02:00:00.000Z`,
        status: 'Completed',
        started_at: `${today}T01:05:00.000Z`,
        completed_at: `${today}T01:55:00.000Z`,
      },
    ],
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'admin1@example.com' },
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
            element: createElement(BookingActivityReportPage),
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

describe('BookingActivityReportPage', () => {
  it('redirects a role that cannot view the report', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Receptionist' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff settings page')).toBeInTheDocument();
  });

  it('Admin has no branch selector and the report is scoped to their own branch', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Admin' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(reportsApi.getBookingActivityReport).mockResolvedValue({
      data: buildReport(),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByLabelText('Branch')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(reportsApi.getBookingActivityReport).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'branch-makati',
        'token'
      )
    );
  });

  it('Superadmin sees a branch selector defaulting to All branches, and the branch column appears', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Superadmin' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(reportsApi.getBookingActivityReport).mockResolvedValue({
      data: buildReport({ branch_id: null }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    const branchSelect = await screen.findByLabelText('Branch');
    await waitFor(() =>
      expect(reportsApi.getBookingActivityReport).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        null,
        'token'
      )
    );
    expect((await screen.findAllByText('Makati')).length).toBeGreaterThan(0);

    await user.selectOptions(branchSelect, 'branch-southwoods');

    await waitFor(() =>
      expect(reportsApi.getBookingActivityReport).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.any(String),
        'branch-southwoods',
        'token'
      )
    );
  });

  it('renders the summary cards and the sign-off block with the viewer as preparer', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Admin', display_name: 'Admin One' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(reportsApi.getBookingActivityReport).mockResolvedValue({
      data: buildReport(),
      error: null,
    });

    renderPage();

    await screen.findByText('Ada Lovelace');

    expect(screen.getByText('Total Bookings')).toBeInTheDocument();
    expect(screen.getAllByText('Checked In').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Checked Out').length).toBeGreaterThan(0);
    expect(screen.getByText('Prepared by: Admin One')).toBeInTheDocument();
    expect(screen.getByText('Signature')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
  });

  it('shows an error banner when the report fails to load', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Admin' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(reportsApi.getBookingActivityReport).mockResolvedValue({
      data: null,
      error: 'Could not load the report.',
    });

    renderPage();

    expect(
      await screen.findByText('Could not load the report.')
    ).toBeInTheDocument();
  });

  it('changing the date range re-fetches the report', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Admin' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(reportsApi.getBookingActivityReport).mockResolvedValue({
      data: buildReport(),
      error: null,
    });

    renderPage();

    await screen.findByText('Ada Lovelace');

    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-08-01' },
    });

    await waitFor(() =>
      expect(reportsApi.getBookingActivityReport).toHaveBeenLastCalledWith(
        '2026-08-01',
        expect.any(String),
        'branch-makati',
        'token'
      )
    );
  });

  it('shows an empty state when no bookings fall in the range', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Admin' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(reportsApi.getBookingActivityReport).mockResolvedValue({
      data: buildReport({ records: [] }),
      error: null,
    });

    renderPage();

    expect(
      await screen.findByText('No bookings in this date range.')
    ).toBeInTheDocument();
  });
});
