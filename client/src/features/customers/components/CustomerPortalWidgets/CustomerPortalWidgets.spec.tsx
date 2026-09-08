import { render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreditBalanceContext } from '../../../credits/providers/CreditBalanceContext';
import type { CreditBalanceContextValue } from '../../../credits/providers/CreditBalanceContext';
import type { Notification } from '../../../notifications/notifications.types';
import type { Pet } from '../../customer.types';
import { listCustomerPets } from '../../api/customer.api';
import { listNotifications } from '../../../notifications/api/notifications.api';
import { CustomerPortalWidgets } from './CustomerPortalWidgets';

vi.mock('../../api/customer.api', () => ({ listCustomerPets: vi.fn() }));
vi.mock('../../../notifications/api/notifications.api', () => ({
  listNotifications: vi.fn(),
}));

function pet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: 'pet-1',
    customer_id: 'customer-1',
    name: 'Rex',
    pet_type: 'Dog',
    breed_id: null,
    photo_url: null,
    gender: null,
    date_of_birth: null,
    weight_class: null,
    coat_type: null,
    assessed_by: null,
    assessed_at: null,
    is_active: true,
    archived_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n-1',
    recipient_staff_id: null,
    recipient_customer_id: 'customer-1',
    event_type: 'booking_confirmed',
    title: 'Booking confirmed',
    message: 'See you soon.',
    related_booking_id: null,
    related_thread_id: null,
    is_read: false,
    is_starred: false,
    is_deleted: false,
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderWidgets(credit: Partial<CreditBalanceContextValue> = {}) {
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
        CreditBalanceContext.Provider,
        { value: creditValue },
        createElement(CustomerPortalWidgets, {
          customerId: 'customer-1',
          accessToken: 'token',
        })
      )
    )
  );
}

describe('CustomerPortalWidgets', () => {
  beforeEach(() => {
    vi.mocked(listCustomerPets).mockResolvedValue({ data: [], error: null });
    vi.mocked(listNotifications).mockResolvedValue({ data: [], error: null });
  });

  it('shows active pets as chips and collapses the overflow into a count', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [
        pet({ id: 'p1', name: 'Rex' }),
        pet({ id: 'p2', name: 'Milo' }),
        pet({ id: 'p3', name: 'Bella' }),
        pet({ id: 'p4', name: 'Coco' }),
        pet({ id: 'p5', name: 'Luna' }),
        pet({ id: 'p6', name: 'Max' }),
        pet({ id: 'p7', name: 'Archived', is_active: false }),
      ],
      error: null,
    });

    renderWidgets();

    const petsPanel = (
      await screen.findByRole('heading', { name: 'My Pets' })
    ).closest('section') as HTMLElement;
    expect(within(petsPanel).getByText('Rex')).toBeInTheDocument();
    // 6 active pets, 5 chips shown -> "+1 more"; the archived pet is excluded.
    expect(within(petsPanel).getByText('+1 more')).toBeInTheDocument();
    expect(within(petsPanel).queryByText('Archived')).not.toBeInTheDocument();
  });

  it('keeps message_received notifications off the board', async () => {
    vi.mocked(listNotifications).mockResolvedValue({
      data: [
        notification({ id: 'keep', title: 'Booking confirmed' }),
        notification({
          id: 'drop',
          title: 'New message',
          event_type: 'message_received',
        }),
      ],
      error: null,
    });

    renderWidgets();

    expect(
      await screen.findByRole('link', { name: /booking confirmed/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /new message/i })
    ).not.toBeInTheDocument();
  });

  it('links the credit tile to the credits page with the total', () => {
    renderWidgets({ total: 1200, balances: [] });

    const link = screen.getByRole('link', { name: /account credit/i });
    expect(link).toHaveAttribute('href', '/portal/credits');
    expect(link).toHaveTextContent('₱1,200.00');
  });
});
