import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile } from '../../../staff/staff.types';
import * as reportsApi from '../../api/reports.api';
import type { BranchComparisonRow } from '../../reports.types';
import { BranchComparisonPage } from './BranchComparisonPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));
vi.mock('../../api/reports.api', () => ({
  getBranchComparison: vi.fn(),
}));

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function buildStaff(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-makati',
    role,
    username: 'boss',
    registered_email: 'boss@example.com',
    display_name: 'Boss',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

const ROWS: BranchComparisonRow[] = [
  {
    branch_id: 'branch-makati',
    branch_name: 'Makati',
    revenue_total: 3000,
    revenue_by_category: { Grooming: 2000, Hotel: 500 },
    counter_sales: 500,
    paid_transaction_count: 6,
    bookings_availed_total: 4,
    bookings_availed_by_category: { Grooming: 3, Hotel: 1 },
    new_customers: 2,
  },
  {
    branch_id: 'branch-southwoods',
    branch_name: 'Southwoods',
    revenue_total: 1000,
    revenue_by_category: { Grooming: 1000 },
    counter_sales: 0,
    paid_transaction_count: 1,
    bookings_availed_total: 7,
    bookings_availed_by_category: { Grooming: 2, Daycare: 5 },
    new_customers: 5,
  },
];

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'boss@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <Routes>
          <Route path="/" element={<BranchComparisonPage />} />
          <Route
            path="/staff/settings"
            element={<div>Staff settings page</div>}
          />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe('BranchComparisonPage', () => {
  it('redirects an Admin away - Superadmin only', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff('Admin')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff settings page')).toBeInTheDocument();
    expect(reportsApi.getBranchComparison).not.toHaveBeenCalled();
  });

  it('shows every branch side by side with revenue by default', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff('Superadmin')],
      error: null,
    });
    vi.mocked(reportsApi.getBranchComparison).mockResolvedValue({
      data: ROWS,
      error: null,
    });

    renderPage();

    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers[1]).toHaveTextContent('Makati');
    expect(headers[1]).toHaveTextContent('₱3,000.00');
    expect(headers[1]).toHaveTextContent('75% of all branches');
    expect(headers[1]).toHaveTextContent('Leads');
    expect(headers[2]).toHaveTextContent('Southwoods');
    expect(headers[2]).toHaveTextContent('₱1,000.00');

    const counterSales = within(table).getByRole('row', {
      name: /Counter sales/,
    });
    expect(counterSales).toHaveTextContent('highest');
    expect(reportsApi.getBranchComparison).toHaveBeenCalledWith(
      'today',
      'token'
    );
  });

  it('switches the comparison from the Compare by dropdown', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff('Superadmin')],
      error: null,
    });
    vi.mocked(reportsApi.getBranchComparison).mockResolvedValue({
      data: ROWS,
      error: null,
    });

    renderPage();
    await screen.findByRole('table');

    await userEvent.selectOptions(
      screen.getByLabelText('Compare by'),
      'bookings'
    );

    const headers = within(screen.getByRole('table')).getAllByRole(
      'columnheader'
    );
    expect(headers[1]).toHaveTextContent('4');
    expect(headers[2]).toHaveTextContent('7');
    expect(headers[2]).toHaveTextContent('Leads');
    expect(screen.getByRole('row', { name: /Daycare/ })).toHaveTextContent('5');

    await userEvent.selectOptions(
      screen.getByLabelText('Compare by'),
      'avg_sale'
    );
    expect(headers[1]).toHaveTextContent('₱500.00');
    expect(headers[2]).toHaveTextContent('₱1,000.00');
  });

  it('refetches when the time period changes', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff('Superadmin')],
      error: null,
    });
    vi.mocked(reportsApi.getBranchComparison).mockResolvedValue({
      data: ROWS,
      error: null,
    });

    renderPage();
    await screen.findByRole('table');

    await userEvent.selectOptions(
      screen.getByLabelText('Time period'),
      'this_month'
    );

    expect(reportsApi.getBranchComparison).toHaveBeenLastCalledWith(
      'this_month',
      'token'
    );
  });
});
