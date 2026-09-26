import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../api/staff.api';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as reportsApi from '../../../reports/api/reports.api';
import * as bookingApi from '../../../booking/api/booking.api';
import * as groomingApi from '../../../grooming/api/grooming.api';
import * as hotelApi from '../../../hotel/api/hotel.api';
import * as daycareApi from '../../../daycare/api/daycare.api';
import * as veterinaryApi from '../../../veterinary/api/veterinary.api';
import type { StaffProfile } from '../../staff.types';
import { StaffDashboardPage } from './StaffDashboardPage';

vi.mock('../../api/staff.api', () => ({
  getStaffProfile: vi.fn(),
  listUnavailabilityBlocks: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../../reports/api/reports.api', () => ({
  getAnalyticsSummary: vi.fn(),
  getCageOccupancyReport: vi.fn(),
  getTransactionHistory: vi.fn(),
}));

vi.mock('../../../booking/api/booking.api', () => ({
  listBookings: vi.fn(),
  listPendingCreditReviews: vi.fn(),
}));

vi.mock('../../../grooming/api/grooming.api', () => ({
  listGroomingQueue: vi.fn(),
}));

vi.mock('../../../hotel/api/hotel.api', () => ({
  listHotelStays: vi.fn(),
  getCareLogEntries: vi.fn(),
}));

vi.mock('../../../daycare/api/daycare.api', () => ({
  listDaycareSessions: vi.fn(),
}));

vi.mock('../../../veterinary/api/veterinary.api', () => ({
  listConsultationQueue: vi.fn(),
}));

function buildProfile(overrides: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: 'user-1',
    branch_id: 'branch-1',
    role: 'Groomer',
    username: 'user1',
    registered_email: 'user1@example.com',
    display_name: 'Test User',
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

function renderDashboard(initialPath: string) {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'user-1', email: 'user@example.com' },
    accessToken: 'access',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialPath] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/dashboard',
            element: createElement(StaffDashboardPage),
          }),
          createElement(Route, {
            path: '/staff/dashboard/:roleSlug',
            element: createElement(StaffDashboardPage),
          })
        )
      )
    )
  );
}

describe('StaffDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Groomer' }),
      error: null,
    });
    // Default (Groomer) dashboard widgets - empty queues/checklist.
    vi.mocked(groomingApi.listGroomingQueue).mockResolvedValue({
      data: { sessions: [] },
      error: null,
    });
    vi.mocked(hotelApi.listHotelStays).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(daycareApi.listDaycareSessions).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects a bare /staff/dashboard visit to the viewer's own role slug", async () => {
    renderDashboard('/staff/dashboard');

    expect(
      await screen.findByRole('heading', { name: /welcome back, test user/i })
    ).toBeInTheDocument();
  });

  it("redirects away from a mismatched role slug to the viewer's own dashboard", async () => {
    renderDashboard('/staff/dashboard/admin');

    expect(
      await screen.findByRole('heading', { name: /welcome back, test user/i })
    ).toBeInTheDocument();
    expect(screen.queryByText('Admin dashboard')).not.toBeInTheDocument();
  });

  it('greets the resolved role with a welcome message instead of a navigation tile grid', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Admin', display_name: 'Ada Min' }),
      error: null,
    });

    renderDashboard('/staff/dashboard/admin');

    expect(
      await screen.findByRole('heading', { name: 'Welcome back, Ada Min!' })
    ).toBeInTheDocument();
    expect(screen.getByText(/admin dashboard/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /staff management/i })
    ).not.toBeInTheDocument();
  });

  it('shows the at-a-glance widgets for a Superadmin viewer only', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Superadmin', display_name: 'Sam Admin' }),
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: [
        { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
        { id: 'branch-southwoods', name: 'Southwoods', is_vet_branch: false },
      ],
      error: null,
    });
    vi.mocked(reportsApi.getAnalyticsSummary).mockResolvedValue({
      data: {
        branch_id: null,
        time_filter: 'today',
        total_revenue: 1000,
        booking_count: 4,
        cancelled_count: 0,
        cancellation_rate: 0,
      },
      error: null,
    });
    vi.mocked(reportsApi.getCageOccupancyReport).mockResolvedValue({
      data: [{ size: 'M', status: 'Available', cage_count: 3 }],
      error: null,
    });
    vi.mocked(reportsApi.getTransactionHistory).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(bookingApi.listBookings).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(groomingApi.listGroomingQueue).mockResolvedValue({
      data: { sessions: [] },
      error: null,
    });
    vi.mocked(hotelApi.listHotelStays).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(daycareApi.listDaycareSessions).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(veterinaryApi.listConsultationQueue).mockResolvedValue({
      data: { consultations: [] },
      error: null,
    });

    renderDashboard('/staff/dashboard/admin');

    expect(
      await screen.findByRole('heading', { name: 'Welcome back, Sam Admin!' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Appointments booked' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'By service' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Revenue' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Cage Availability' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Recent Transactions' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Makati vs Southwoods Revenue' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View all queues' })
    ).toHaveAttribute('href', '/staff/bookings/queue');
    expect(
      screen.getByRole('heading', { name: 'Grooming Queue' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Hotel Queue' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Daycare Queue' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Veterinary Consultation Queue',
      })
    ).toBeInTheDocument();
  });

  it('does not show the Superadmin widgets for an Admin viewer', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Admin', display_name: 'Ada Min' }),
      error: null,
    });

    renderDashboard('/staff/dashboard/admin');

    await screen.findByRole('heading', { name: 'Welcome back, Ada Min!' });

    expect(
      screen.queryByRole('heading', { name: 'Appointments booked' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Cage Availability' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Recent Transactions' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Makati vs Southwoods Revenue',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Grooming Queue' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Hotel Queue' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Daycare Queue' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Veterinary Consultation Queue',
      })
    ).not.toBeInTheDocument();
  });
  it('shows Cage Occupancy, My Schedule, Customer Management, and Branch Reports for a Supervisor viewer', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Supervisor', display_name: 'Sue Pervisor' }),
      error: null,
    });
    vi.mocked(staffApi.listUnavailabilityBlocks).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(reportsApi.getCageOccupancyReport).mockResolvedValue({
      data: [{ size: 'M', status: 'Available', cage_count: 3 }],
      error: null,
    });

    renderDashboard('/staff/dashboard/supervisor');

    expect(
      await screen.findByRole('heading', { name: 'Cage Occupancy' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'My Schedule' })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'View schedule' })
    ).toHaveAttribute('href', '/staff/my-schedule');
    expect(
      screen.getByRole('link', { name: /customer management/i })
    ).toHaveAttribute('href', '/staff/admin/customers');
    expect(
      screen.getByRole('link', { name: /branch reports/i })
    ).toHaveAttribute('href', '/staff/reports/dsr');
  });
  it('shows the Boarding Checklist and Grooming, Hotel, and Daycare queues for a Groomer viewer', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [
        {
          id: 'entry-1',
          stay_id: 'stay-1',
          care_type: 'Feeding',
          scheduled_date: '2026-09-26',
          description: 'Breakfast',
          time_block: 'Morning',
          status: 'Completed',
          completed_at: null,
          completed_by: null,
          created_at: '2026-09-26T00:00:00.000Z',
        },
        {
          id: 'entry-2',
          stay_id: 'stay-1',
          care_type: 'Walking',
          scheduled_date: '2026-09-26',
          description: 'Evening walk',
          time_block: 'Evening',
          status: 'Pending',
          completed_at: null,
          completed_by: null,
          created_at: '2026-09-26T00:00:00.000Z',
        },
      ],
      error: null,
    });

    renderDashboard('/staff/dashboard/groomer');

    expect(
      await screen.findByRole('heading', { name: 'Boarding Checklist' })
    ).toBeInTheDocument();
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '50'
    );
    expect(
      screen.getByRole('link', { name: 'Open checklist' })
    ).toHaveAttribute('href', '/staff/hotel/care-log');
    expect(
      screen.getByRole('heading', { name: 'Grooming Queue' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Hotel Queue' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Daycare Queue' })
    ).toBeInTheDocument();
  });
  it('shows Transactions, My Schedule, Credit Management, and Credit Review Queue for a Cashier viewer', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildProfile({ role: 'Cashier', display_name: 'Cash Ier' }),
      error: null,
    });
    vi.mocked(staffApi.listUnavailabilityBlocks).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(bookingApi.listPendingCreditReviews).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(reportsApi.getTransactionHistory).mockResolvedValue({
      data: [
        {
          id: 'txn-1',
          booking_id: 'booking-1',
          booking_group_id: null,
          customer_id: 'customer-1',
          customer_name: 'Jane Owner',
          branch_id: 'branch-1',
          transaction_type: 'booking_payment',
          payment_method: 'Cash',
          payment_status: 'Fully Paid',
          payment_choice: 'full',
          total_amount: 1500,
          misc_sale_description: null,
          created_at: new Date().toISOString(),
          bookings: {
            pet_id: 'pet-1',
            service_category: 'Grooming',
            payment_status: 'Fully Paid',
            total_price: 1500,
            discount_amount: 0,
            promo_amount: 0,
          },
        },
      ],
      error: null,
    });

    renderDashboard('/staff/dashboard/cashier');

    expect(
      await screen.findByRole('heading', { name: 'Transactions' })
    ).toBeInTheDocument();
    expect(await screen.findByText('Grooming payment')).toBeInTheDocument();
    expect(screen.getByText(/jane owner/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/staff/reports/transaction-history'
    );
    expect(
      screen.getByRole('heading', { name: 'My Schedule' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /credit management/i })
    ).toHaveAttribute('href', '/staff/credits');
    expect(
      screen.getByRole('heading', { name: 'Credit Review Queue' })
    ).toBeInTheDocument();
  });
});
