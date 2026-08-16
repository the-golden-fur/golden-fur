import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as hotelApi from '../../../hotel/api/hotel.api';
import type { Cage } from '../../../hotel/hotel.types';
import * as reportsApi from '../../api/reports.api';
import { CageOccupancyReport } from './CageOccupancyReport';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../../hotel/api/hotel.api', () => ({
  getCageGrid: vi.fn(),
}));

vi.mock('../../api/reports.api', () => ({
  getCageOccupancyReport: vi.fn(),
}));

function buildViewer(
  role: StaffRole,
  overrides: Partial<StaffProfile> = {}
): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-makati',
    role,
    username: 'receptionist',
    registered_email: 'staff@example.com',
    display_name: 'Front Desk',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildCage(overrides: Partial<Cage> = {}): Cage {
  return {
    id: 'cage-1',
    branch_id: 'branch-makati',
    cage_label: 'S-01',
    size: 'S',
    status: 'Available',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'staff@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/reports/cage-occupancy'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/reports/cage-occupancy',
            element: createElement(CageOccupancyReport),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: 'Settings page',
          })
        )
      )
    )
  );
}

describe('CageOccupancyReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: [{ id: 'branch-makati', name: 'Makati', is_vet_branch: true }],
      error: null,
    });
    vi.mocked(reportsApi.getCageOccupancyReport).mockResolvedValue({
      data: [{ size: 'S', status: 'Available', cage_count: 3 }],
      error: null,
    });
    vi.mocked(hotelApi.getCageGrid).mockResolvedValue({
      data: {
        S: [
          buildCage({ id: 'cage-1', cage_label: 'S-01', status: 'Available' }),
          buildCage({ id: 'cage-2', cage_label: 'S-02', status: 'Occupied' }),
        ],
        M: [buildCage({ id: 'cage-3', cage_label: 'M-01', size: 'M' })],
        L: [],
        XL: [],
      },
      error: null,
    });
  });

  it('redirects a viewer with no access at all to Settings', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Groomer')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Settings page')).toBeInTheDocument();
  });

  it('lets a Receptionist view the page and its individual cage list', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('S-01')).toBeInTheDocument();
    expect(screen.getByText('S-02')).toBeInTheDocument();
    expect(screen.getByText('M-01')).toBeInTheDocument();
    expect(screen.getByText('3 of 3 cages')).toBeInTheDocument();
  });

  it('searches individual cages by label', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();
    await screen.findByText('S-01');

    await userEvent.type(
      screen.getByPlaceholderText('Search by cage label...'),
      'M-01'
    );

    await waitFor(() => {
      expect(screen.queryByText('S-01')).not.toBeInTheDocument();
      expect(screen.getByText('M-01')).toBeInTheDocument();
    });
    expect(screen.getByText('1 of 3 cages')).toBeInTheDocument();
  });

  it('filters individual cages by status', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();
    await screen.findByText('S-01');

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Occupied');

    await waitFor(() => {
      expect(screen.queryByText('S-01')).not.toBeInTheDocument();
      expect(screen.getByText('S-02')).toBeInTheDocument();
    });
    expect(screen.getByText('1 of 3 cages')).toBeInTheDocument();
  });

  it('filters individual cages by size', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();
    await screen.findByText('S-01');

    await userEvent.selectOptions(screen.getByLabelText('Size'), 'Medium');

    await waitFor(() => {
      expect(screen.queryByText('S-01')).not.toBeInTheDocument();
      expect(screen.getByText('M-01')).toBeInTheDocument();
    });
    expect(screen.getByText('1 of 3 cages')).toBeInTheDocument();
  });

  it('sorts individual cages by status', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();
    await screen.findByText('S-01');

    await userEvent.selectOptions(
      screen.getByDisplayValue('Sort: Label (A-Z)'),
      'status'
    );

    const labels = screen
      .getAllByText(/^(S-01|S-02|M-01)$/)
      .map((el) => el.textContent);
    // Available (S-01, M-01) sorts before Occupied (S-02) alphabetically.
    expect(labels.indexOf('S-02')).toBeGreaterThan(labels.indexOf('S-01'));
    expect(labels.indexOf('S-02')).toBeGreaterThan(labels.indexOf('M-01'));
  });
});
