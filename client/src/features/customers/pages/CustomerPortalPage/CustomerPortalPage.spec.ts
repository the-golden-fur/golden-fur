import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import { CreditBalanceContext } from '../../../credits/providers/CreditBalanceContext';
import type { CreditBalanceContextValue } from '../../../credits/providers/CreditBalanceContext';
import type { CreditBalance } from '../../../credits/credits.types';
import { getCustomerProfile, listCustomerPets } from '../../api/customer.api';
import { listNotifications } from '../../../notifications/api/notifications.api';
import { listMyConflictedBookings } from '../../../booking/api/booking.api';
import { CustomerPortalPage } from './CustomerPortalPage';

vi.mock('../../api/customer.api', () => ({
  getCustomerProfile: vi.fn(),
  listCustomerPets: vi.fn(),
}));

vi.mock('../../../notifications/api/notifications.api', () => ({
  listNotifications: vi.fn(),
}));

vi.mock('../../../booking/api/booking.api', () => ({
  listMyConflictedBookings: vi.fn(),
}));

function balance(overrides: Partial<CreditBalance> = {}): CreditBalance {
  return {
    id: 'bal-1',
    customer_id: 'customer-1',
    branch_id: 'branch-1',
    balance: 500,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    next_expires_at: null,
    next_expires_amount: null,
    ...overrides,
  };
}

function renderPage(credit: Partial<CreditBalanceContextValue> = {}) {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'customer-1', email: 'customer@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  const creditValue: CreditBalanceContextValue = {
    balances: [],
    total: 0,
    isLoading: false,
    refresh: vi.fn(),
    ...credit,
  };

  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          CreditBalanceContext.Provider,
          { value: creditValue },
          createElement(CustomerPortalPage)
        )
      )
    )
  );
}

describe('CustomerPortalPage', () => {
  beforeEach(() => {
    vi.mocked(getCustomerProfile).mockResolvedValue({
      data: null,
      error: 'pending',
    });
    vi.mocked(listCustomerPets).mockResolvedValue({ data: [], error: null });
    vi.mocked(listNotifications).mockResolvedValue({ data: [], error: null });
    vi.mocked(listMyConflictedBookings).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('greets the customer by name once their profile loads', async () => {
    vi.mocked(getCustomerProfile).mockResolvedValue({
      data: {
        id: 'customer-1',
        full_name: 'Jane Dela Cruz',
        contact_number: null,
        emergency_contact_name: null,
        emergency_contact_number: null,
        preferred_communication_channel: null,
        account_email: 'jane@example.com',
        primary_auth_provider: 'email',
        facebook_id: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole('heading', {
        name: 'Welcome back, Jane Dela Cruz!',
      })
    ).toBeInTheDocument();
  });

  it('shows a generic welcome before the profile has loaded', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Welcome back!' })
    ).toBeInTheDocument();
  });

  it('renders the dashboard widgets with links to their pages', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Notification Board' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /book a service/i })
    ).toHaveAttribute('href', '/portal/book');
    expect(
      screen.getByRole('link', { name: /view transactions/i })
    ).toHaveAttribute('href', '/portal/transactions');
    expect(
      screen.getByRole('heading', { name: 'My Pets' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/portal/pets'
    );
  });

  it('shows the account credit total in the credits widget', () => {
    renderPage({ total: 500, balances: [balance({ balance: 500 })] });

    const link = screen.getByRole('link', { name: /account credit/i });
    expect(link).toHaveAttribute('href', '/portal/credits');
    expect(link).toHaveTextContent('₱500.00');
  });

  it('lists the customer notifications on the board', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      data: [
        {
          id: 'n-1',
          recipient_staff_id: null,
          recipient_customer_id: 'customer-1',
          event_type: 'booking_confirmed',
          title: 'Booking confirmed',
          message: 'Your grooming appointment is set.',
          related_booking_id: 'b-1',
          related_thread_id: null,
          is_read: false,
          is_starred: false,
          is_deleted: false,
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ],
      error: null,
    });

    renderPage();

    const row = await screen.findByRole('link', { name: /booking confirmed/i });
    expect(row).toHaveAttribute('href', '/portal/notifications?open=n-1');
  });

  it('pops up the slot-conflict modal listing every affected booking, linked to it', async () => {
    vi.mocked(listMyConflictedBookings).mockResolvedValue({
      data: [
        {
          id: 'booking-1',
          service_category: 'Grooming',
          pet_id: 'pet-1',
          pet_name: 'Max',
          scheduled_start: '2026-09-15T08:00:00.000Z',
          scheduled_end: '2026-09-15T09:00:00.000Z',
          branch_id: 'branch-1',
          branch_name: 'Makati',
          conflict_notice:
            'Your Grooming booking on Sep 15, 2026 is no longer available.',
          slot_conflict_at: '2026-09-11T10:00:00.000Z',
        },
      ],
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole('heading', {
        name: 'A booking slot is no longer available',
      })
    ).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /grooming - max/i });
    expect(link).toHaveAttribute('href', '/portal/bookings?open=booking-1');
  });

  it('does not show the slot-conflict popup when nothing is flagged', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Welcome back!' });

    expect(
      screen.queryByRole('heading', {
        name: /booking slot.*no longer available/i,
      })
    ).not.toBeInTheDocument();
  });
});
