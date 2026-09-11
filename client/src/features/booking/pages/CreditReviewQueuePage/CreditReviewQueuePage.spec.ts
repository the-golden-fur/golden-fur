import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as customerApi from '../../../customers/api/customer.api';
import * as bookingApi from '../../api/booking.api';
import type {
  Booking,
  CancellationLog,
  CreditReviewQueueItem,
} from '../../booking.types';
import { CreditReviewQueuePage } from './CreditReviewQueuePage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  getCustomerProfile: vi.fn(),
}));

vi.mock('../../api/booking.api', () => ({
  listPendingCreditReviews: vi.fn(),
  decideCreditReview: vi.fn(),
}));

function buildViewer(role: StaffRole): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-1',
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
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function buildBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    customer_id: 'cust-1',
    pet_id: 'pet-1',
    branch_id: 'branch-1',
    created_by_staff_id: null,
    service_category: 'Hotel',
    booking_source: 'Online',
    scheduled_start: '2026-08-01T00:00:00.000Z',
    scheduled_end: '2026-08-03T00:00:00.000Z',
    assigned_staff_id: null,
    status: 'Cancelled',
    payment_status: 'Partially Paid',
    total_price: 850,
    downpayment_amount: 425,
    downpayment_required: true,
    downpayment_due_at: null,
    payment_method: 'Cash',
    payment_confirmed: false,
    selected_discount_id: null,
    selected_promo_id: null,
    discount_amount: 0,
    promo_amount: 0,
    special_instructions: null,
    hotel_preferences: null,
    preferred_cage_id: null,
    started_at: null,
    completed_at: null,
    paid_at: null,
    cancelled_at: '2026-07-30T00:00:00.000Z',
    cancellation_reason: 'Pet got sick',
    reschedule_count: 0,
    pending_reschedule_fee_amount: null,
    slot_conflict_at: null,
    conflict_notice: null,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    booking_group_id: null,
    ...overrides,
  };
}

function buildLog(overrides: Partial<CancellationLog> = {}): CancellationLog {
  return {
    id: 'log-1',
    booking_id: 'booking-1',
    customer_id: 'cust-1',
    branch_id: 'branch-1',
    event_type: 'cancellation',
    notice_period_met: false,
    enforcement_mode_applied: 'Strict',
    policy_violation: true,
    credit_issued: false,
    credit_amount: null,
    reschedule_fee_charged: null,
    credit_review_status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    notes: null,
    created_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

function buildItem(
  overrides: Partial<CreditReviewQueueItem> = {}
): CreditReviewQueueItem {
  return {
    log: buildLog(),
    booking: buildBooking(),
    amount_paid: 425,
    potential_credit_amount: 425,
    ...overrides,
  };
}

function stubPetAndOwner() {
  vi.mocked(customerApi.getPet).mockResolvedValue({
    data: {
      id: 'pet-1',
      customer_id: 'cust-1',
      name: 'Max',
      pet_type: 'Dog',
      breed_id: null,
      photo_url: null,
      gender: 'Male',
      date_of_birth: null,
      weight_class: 'M',
      coat_type: 'SC',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    error: null,
  });
  vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
    data: {
      id: 'cust-1',
      full_name: 'Jamie Cruz',
      contact_number: null,
      emergency_contact_name: null,
      emergency_contact_number: null,
      preferred_communication_channel: null,
      account_email: 'jamie@example.com',
      primary_auth_provider: 'email',
      facebook_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    error: null,
  });
}

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
      { initialEntries: ['/staff/bookings/credit-review-queue'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/bookings/credit-review-queue',
            element: createElement(CreditReviewQueuePage),
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

describe('CreditReviewQueuePage (manual-cancellation-credit-review custom change)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubPetAndOwner();
  });

  it('redirects a role that cannot handle money (e.g. Groomer)', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Groomer')],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Staff settings page')).toBeInTheDocument()
    );
  });

  it('loads and renders each pending review with its resolved pet/owner names', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listPendingCreditReviews).mockResolvedValue({
      data: [buildItem()],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Max')).toBeInTheDocument();
    expect(screen.getByText('Owner: Jamie Cruz')).toBeInTheDocument();
    expect(screen.getByText('"Pet got sick"')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is pending', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listPendingCreditReviews).mockResolvedValue({
      data: [],
      error: null,
    });

    renderPage();

    expect(
      await screen.findByText('No cancellations awaiting review.')
    ).toBeInTheDocument();
  });

  it('approving removes the card and calls decideCreditReview with "approved"', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listPendingCreditReviews).mockResolvedValue({
      data: [buildItem()],
      error: null,
    });
    vi.mocked(bookingApi.decideCreditReview).mockResolvedValue({
      data: buildLog({ credit_review_status: 'approved' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Max');
    await user.click(screen.getByText('Approve credit'));

    await waitFor(() =>
      expect(bookingApi.decideCreditReview).toHaveBeenCalledWith(
        'log-1',
        'token',
        'approved'
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Max')).not.toBeInTheDocument()
    );
  });

  it('denying removes the card and calls decideCreditReview with "denied"', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listPendingCreditReviews).mockResolvedValue({
      data: [buildItem()],
      error: null,
    });
    vi.mocked(bookingApi.decideCreditReview).mockResolvedValue({
      data: buildLog({ credit_review_status: 'denied' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Max');
    await user.click(screen.getByText('Deny'));

    await waitFor(() =>
      expect(bookingApi.decideCreditReview).toHaveBeenCalledWith(
        'log-1',
        'token',
        'denied'
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Max')).not.toBeInTheDocument()
    );
  });

  it('keeps the card and shows an error banner when the decision fails', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });
    vi.mocked(bookingApi.listPendingCreditReviews).mockResolvedValue({
      data: [buildItem()],
      error: null,
    });
    vi.mocked(bookingApi.decideCreditReview).mockResolvedValue({
      data: null,
      error: 'Could not issue the credit - please try again',
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Max');
    await user.click(screen.getByText('Approve credit'));

    expect(
      await screen.findByText('Could not issue the credit - please try again')
    ).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });
});
