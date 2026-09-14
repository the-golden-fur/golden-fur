import { render, screen, waitFor, within } from '@testing-library/react';
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
import type { DailySalesReport } from '../../reports.types';
import { DailySalesReportPage } from './DailySalesReportPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));
vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));
vi.mock('../../api/reports.api', () => ({
  getDailySalesReport: vi.fn(),
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
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildReport(
  overrides: Partial<DailySalesReport> = {}
): DailySalesReport {
  return {
    branch_id: 'branch-makati',
    report_date: '2026-09-14',
    breakdown: [
      {
        service_category: 'Grooming',
        payment_method: 'Cash',
        transaction_count: 3,
        gross_amount: 900,
      },
    ],
    totals: { transaction_count: 3, gross_amount: 900 },
    credit_usage: { transaction_count: 1, total_credit_applied: 150 },
    misc_sales: [],
    misc_sales_total: 0,
    ...overrides,
  } as DailySalesReport;
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
            element: createElement(DailySalesReportPage),
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

describe('DailySalesReportPage', () => {
  it('redirects a role that cannot view the DSR', async () => {
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
    vi.mocked(reportsApi.getDailySalesReport).mockResolvedValue({
      data: buildReport(),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Makati')).toBeInTheDocument();
    expect(screen.queryByLabelText('Branch')).not.toBeInTheDocument();
    expect(reportsApi.getDailySalesReport).toHaveBeenCalledWith(
      expect.any(String),
      'branch-makati',
      'token'
    );
  });

  it('Superadmin sees a branch selector defaulting to All branches, and can switch branches', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Superadmin' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(reportsApi.getDailySalesReport).mockResolvedValue({
      data: buildReport(),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    const branchSelect = await screen.findByLabelText('Branch');
    expect(reportsApi.getDailySalesReport).toHaveBeenCalledWith(
      expect.any(String),
      null,
      'token'
    );

    await user.selectOptions(branchSelect, 'branch-southwoods');

    await waitFor(() =>
      expect(reportsApi.getDailySalesReport).toHaveBeenLastCalledWith(
        expect.any(String),
        'branch-southwoods',
        'token'
      )
    );
  });

  it('renders the service breakdown table with a totals row and the credit usage summary', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Admin' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(reportsApi.getDailySalesReport).mockResolvedValue({
      data: buildReport(),
      error: null,
    });

    renderPage();

    const categoryCell = await screen.findByText('Grooming');
    expect(
      within(categoryCell.closest('tr')!).getByText('₱900.00')
    ).toBeInTheDocument();
    expect(screen.getByText(/1 redemption\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/₱150.00 applied/)).toBeInTheDocument();
    expect(
      screen.getByText('No miscellaneous sales today.')
    ).toBeInTheDocument();
  });

  it('renders the miscellaneous sales table and its own total when present', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Admin' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(reportsApi.getDailySalesReport).mockResolvedValue({
      data: buildReport({
        misc_sales: [
          { payment_method: 'GCash', transaction_count: 2, gross_amount: 300 },
        ],
        misc_sales_total: 300,
      }),
      error: null,
    });

    renderPage();

    const gcashCell = await screen.findByText('GCash');
    expect(
      within(gcashCell.closest('tr')!).getByText('₱300.00')
    ).toBeInTheDocument();
    const miscSection = screen
      .getByText('Miscellaneous Sales')
      .closest('section')!;
    const miscTotalRow = within(miscSection).getByText('Total').closest('tr')!;
    expect(within(miscTotalRow).getByText('₱300.00')).toBeInTheDocument();
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
    vi.mocked(reportsApi.getDailySalesReport).mockResolvedValue({
      data: null,
      error: 'Could not load the report.',
    });

    renderPage();

    expect(
      await screen.findByText('Could not load the report.')
    ).toBeInTheDocument();
  });

  it('changing the date re-fetches the report for the new date', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Admin' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(reportsApi.getDailySalesReport).mockResolvedValue({
      data: buildReport(),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Grooming');

    const dateInput = screen.getByLabelText('Date');
    await user.clear(dateInput);
    await user.type(dateInput, '2026-08-01');

    await waitFor(() =>
      expect(reportsApi.getDailySalesReport).toHaveBeenLastCalledWith(
        '2026-08-01',
        'branch-makati',
        'token'
      )
    );
  });
});
