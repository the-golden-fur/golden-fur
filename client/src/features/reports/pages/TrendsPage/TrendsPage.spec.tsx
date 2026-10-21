import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile } from '../../../staff/staff.types';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as reportsApi from '../../api/reports.api';
import type { TrendsReport } from '../../reports.types';
import { presetPeriod } from '../../utils/trendsPeriod';
import { TrendsPage } from './TrendsPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));
vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));
vi.mock('../../api/reports.api', () => ({
  getTrendsReport: vi.fn(),
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

function buildReport(overrides: Partial<TrendsReport> = {}): TrendsReport {
  return {
    bookings_total: 7,
    bookings_by_category: { Grooming: 5, Veterinary: 2 },
    bookings_by_pet_type: { Dog: 5, Cat: 2 },
    registered_pets_by_type: { Dog: 40, Cat: 12 },
    new_pets_by_type: { Dog: 3 },
    packages_booked: [
      { name: 'Spa Day', count: 2 },
      { name: 'Puppy Starter', count: 0 },
    ],
    top_grooming_services: [{ name: 'Full Groom', count: 4 }],
    staff_bookings: [
      {
        staff_id: 'groomer-1',
        display_name: 'Ana Groomer',
        role: 'Groomer',
        bookings: 4,
        completed: 3,
      },
      {
        staff_id: null,
        display_name: 'Unassigned',
        role: 'Groomer',
        bookings: 1,
        completed: 0,
      },
      {
        staff_id: 'vet-1',
        display_name: 'Dr. Ben',
        role: 'Veterinarian',
        bookings: 2,
        completed: 2,
      },
    ],
    deleted_pet_reasons: { passed_away: 2, other: 1 },
    deleted_pet_other_notes: [
      { note: 'Moving abroad', archived_at: '2026-10-05T03:00:00.000Z' },
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
            element: createElement(TrendsPage),
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

function mockViewer(role: StaffProfile['role']) {
  vi.mocked(staffApi.listStaff).mockResolvedValue({
    data: [buildStaff({ role })],
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
    data: BRANCHES,
    error: null,
  });
  vi.mocked(reportsApi.getTrendsReport).mockResolvedValue({
    data: buildReport(),
    error: null,
  });
});

describe('TrendsPage', () => {
  it('redirects a role that cannot view Trends', async () => {
    mockViewer('Groomer');

    renderPage();

    expect(await screen.findByText('Staff settings page')).toBeInTheDocument();
  });

  it('a Supervisor sees their own branch only, for this month by default', async () => {
    mockViewer('Supervisor');

    renderPage();

    expect(await screen.findByText('Ana Groomer')).toBeInTheDocument();
    expect(screen.queryByLabelText('Branch')).not.toBeInTheDocument();
    const thisMonth = presetPeriod('this-month');
    expect(reportsApi.getTrendsReport).toHaveBeenCalledWith(
      thisMonth.from,
      thisMonth.to,
      'branch-makati',
      'token'
    );
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('a Superadmin defaults to all branches and can pick one', async () => {
    mockViewer('Superadmin');
    const user = userEvent.setup();

    renderPage();

    const branchSelect = await screen.findByLabelText('Branch');
    expect(reportsApi.getTrendsReport).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      null,
      'token'
    );

    await user.selectOptions(branchSelect, 'branch-southwoods');

    await waitFor(() =>
      expect(reportsApi.getTrendsReport).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.any(String),
        'branch-southwoods',
        'token'
      )
    );
  });

  it('the month picker loads that whole month', async () => {
    mockViewer('Admin');

    renderPage();

    fireEvent.change(await screen.findByLabelText('Month'), {
      target: { value: '2026-02' },
    });

    await waitFor(() =>
      expect(reportsApi.getTrendsReport).toHaveBeenLastCalledWith(
        '2026-02-01',
        '2026-02-28',
        'branch-makati',
        'token'
      )
    );
  });

  it('shows the headline numbers, every panel, and groomer/vet bookings', async () => {
    mockViewer('Admin');

    renderPage();

    expect(await screen.findByText('Dog bookings')).toBeInTheDocument();
    expect(screen.getByText('Cat bookings')).toBeInTheDocument();
    expect(
      screen.getByText('Packages booked', { selector: 'dt' })
    ).toBeInTheDocument();

    const groomers = screen.getByRole('list', { name: 'Bookings per groomer' });
    expect(within(groomers).getByText('Ana Groomer')).toBeInTheDocument();
    expect(within(groomers).getByText(/3 completed/)).toBeInTheDocument();
    expect(within(groomers).getByText('Unassigned')).toBeInTheDocument();

    const vets = screen.getByRole('list', {
      name: 'Bookings per veterinarian',
    });
    expect(within(vets).getByText('Dr. Ben')).toBeInTheDocument();

    const topGrooming = screen.getByRole('list', {
      name: 'Top grooming services',
    });
    expect(within(topGrooming).getByText('Full Groom')).toBeInTheDocument();

    const registered = screen.getByRole('list', { name: 'Registered pets' });
    expect(within(registered).getByText(/\+3 new/)).toBeInTheDocument();
  });

  it('labels deleted-pet reasons and lists the latest "Other" notes', async () => {
    mockViewer('Admin');

    renderPage();

    const reasons = await screen.findByRole('list', {
      name: 'Deleted pet reasons',
    });
    expect(within(reasons).getByText('Passed away')).toBeInTheDocument();
    expect(within(reasons).getByText('Other')).toBeInTheDocument();
    expect(screen.getByText('Moving abroad')).toBeInTheDocument();
  });

  it('shows an empty message for a panel with nothing in it', async () => {
    mockViewer('Admin');
    vi.mocked(reportsApi.getTrendsReport).mockResolvedValue({
      data: buildReport({
        deleted_pet_reasons: {},
        deleted_pet_other_notes: [],
      }),
      error: null,
    });

    renderPage();

    expect(
      await screen.findByText('No pets deleted in this period.')
    ).toBeInTheDocument();
  });

  it('shows the server error', async () => {
    mockViewer('Admin');
    vi.mocked(reportsApi.getTrendsReport).mockResolvedValue({
      data: null,
      error: 'Something went wrong',
    });

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong'
    );
  });
});
