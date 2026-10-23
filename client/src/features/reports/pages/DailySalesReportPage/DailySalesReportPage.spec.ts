import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
import type { DailySalesReport, TransactionRecord } from '../../reports.types';
import { currentReportDay, shiftReportDay } from '../../utils/reportDay';
import { DailySalesReportPage } from './DailySalesReportPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));
vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
  listBranchLetterheads: vi.fn().mockResolvedValue({ data: [], error: null }),
}));
vi.mock('../../api/reports.api', () => ({
  getDailySalesReport: vi.fn(),
  getTransactionHistory: vi.fn().mockResolvedValue({ data: [], error: null }),
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

function buildTransaction(
  overrides: Partial<TransactionRecord> = {}
): TransactionRecord {
  return {
    id: 'txn-1',
    booking_id: 'booking-1',
    booking_group_id: null,
    customer_id: 'cust-1',
    customer_name: 'Ada Lovelace',
    branch_id: 'branch-makati',
    transaction_type: 'booking_payment',
    payment_method: 'GCash',
    payment_status: 'Fully Paid',
    payment_choice: 'full',
    total_amount: 500,
    misc_sale_description: null,
    created_at: '2026-09-14T02:00:00.000Z',
    bookings: { pet_id: 'pet-1', service_category: 'Grooming' },
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
    // The report-fetch effect only waits on listStaff (viewerBranchId), while
    // 'Makati' rendering also waits on the separate listBranches promise -
    // don't assume the former has already committed just because the latter
    // has painted; wait for it explicitly instead of asserting immediately.
    await waitFor(() =>
      expect(reportsApi.getDailySalesReport).toHaveBeenCalledWith(
        expect.any(String),
        'branch-makati',
        'token'
      )
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
    await waitFor(() =>
      expect(reportsApi.getDailySalesReport).toHaveBeenCalledWith(
        expect.any(String),
        null,
        'token'
      )
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

    renderPage();

    await screen.findByText('Grooming');

    // A date picker sets the whole value at once. Clearing the field is
    // deliberately ignored (no day to load), so the date can't be typed
    // over character by character from empty.
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-08-01' },
    });

    // The selected day plus the day before it, for the summary cards.
    await waitFor(() =>
      expect(reportsApi.getDailySalesReport).toHaveBeenCalledWith(
        '2026-08-01',
        'branch-makati',
        'token'
      )
    );
    expect(reportsApi.getDailySalesReport).toHaveBeenCalledWith(
      '2026-07-31',
      'branch-makati',
      'token'
    );
  });

  it('Previous/Next day buttons step the date one day at a time, and Next is disabled on today', async () => {
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

    const today = currentReportDay();
    const dateInput = screen.getByLabelText('Date');
    expect(dateInput).toHaveValue(today);
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous day' }));

    const yesterday = shiftReportDay(today, -1);
    expect(dateInput).toHaveValue(yesterday);
    await waitFor(() =>
      expect(reportsApi.getDailySalesReport).toHaveBeenCalledWith(
        shiftReportDay(today, -2),
        'branch-makati',
        'token'
      )
    );

    const nextButton = screen.getByRole('button', { name: 'Next day' });
    expect(nextButton).toBeEnabled();
    await user.click(nextButton);
    expect(dateInput).toHaveValue(today);
  });

  it('summary cards show the day and compare it with the day before', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Admin' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    const today = currentReportDay();
    vi.mocked(reportsApi.getDailySalesReport).mockImplementation(
      async (reportDate) => ({
        data:
          reportDate === today
            ? buildReport({
                totals: { transaction_count: 3, gross_amount: 900 },
              })
            : buildReport({
                totals: { transaction_count: 4, gross_amount: 600 },
              }),
        error: null,
      })
    );

    renderPage();

    const summary = await screen.findByRole('region', { name: 'Day summary' });
    const salesCard = within(summary).getByText('Total sales').parentElement!;
    expect(within(salesCard).getByText('₱900.00')).toBeInTheDocument();
    expect(within(salesCard).getByText('+50%')).toBeInTheDocument();
    expect(
      within(salesCard).getByText('Yesterday ₱600.00')
    ).toBeInTheDocument();

    const txnCard = within(summary).getByText('Transactions').parentElement!;
    expect(within(txnCard).getByText('-25%')).toBeInTheDocument();
  });

  it('still shows the summary cards, without the comparison, when only the previous day fails to load', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildStaff({ role: 'Admin' })],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    const today = currentReportDay();
    vi.mocked(reportsApi.getDailySalesReport).mockImplementation(
      async (reportDate) =>
        reportDate === today
          ? { data: buildReport(), error: null }
          : { data: null, error: 'Server error' }
    );

    renderPage();

    const summary = await screen.findByRole('region', { name: 'Day summary' });
    expect(within(summary).getByText('Total sales')).toBeInTheDocument();
    expect(within(summary).queryByText(/Yesterday/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('Print', () => {
    function mockAdminReport() {
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
    }

    it('prints one receipt per settled transaction of the day, oldest first, and skips unpaid ones', async () => {
      window.print = vi.fn();
      mockAdminReport();
      vi.mocked(reportsApi.getTransactionHistory).mockResolvedValue({
        data: [
          buildTransaction({
            id: 'txn-late',
            customer_name: 'Zoe Late',
            created_at: '2026-09-14T08:00:00.000Z',
          }),
          buildTransaction({
            id: 'txn-unpaid',
            customer_name: 'Unpaid Person',
            payment_status: 'Pending',
          }),
          buildTransaction({
            id: 'txn-misc',
            transaction_type: 'miscellaneous_sale',
            misc_sale_description: 'Leash',
            customer_name: 'Ada Early',
            booking_id: null,
            bookings: null,
            payment_choice: null,
            created_at: '2026-09-14T01:00:00.000Z',
          }),
        ],
        error: null,
      });

      renderPage();
      await screen.findByText('Grooming');

      // Fetched for the report's own day and branch.
      expect(reportsApi.getTransactionHistory).toHaveBeenCalledWith(
        {
          branchId: 'branch-makati',
          dateFrom: currentReportDay(),
          dateTo: currentReportDay(),
        },
        'token'
      );

      await userEvent.click(screen.getByRole('button', { name: 'Print' }));

      expect(window.print).toHaveBeenCalledTimes(1);
      const receipts = screen.getAllByRole('document', { name: 'Receipt' });
      expect(receipts).toHaveLength(2);
      expect(receipts[0]).toHaveTextContent('Ada Early');
      expect(receipts[0]).toHaveTextContent('Leash');
      expect(receipts[1]).toHaveTextContent('Zoe Late');
      expect(screen.queryByText('Unpaid Person')).not.toBeInTheDocument();

      // Taken down again once the print dialog closes.
      act(() => {
        window.dispatchEvent(new Event('afterprint'));
      });
      expect(
        screen.queryByRole('document', { name: 'Receipt' })
      ).not.toBeInTheDocument();
    });

    it('is disabled when the day has no settled transactions', async () => {
      mockAdminReport();
      vi.mocked(reportsApi.getTransactionHistory).mockResolvedValue({
        data: [buildTransaction({ payment_status: 'Pending' })],
        error: null,
      });

      renderPage();
      await screen.findByText('Grooming');

      expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    });
  });
});
