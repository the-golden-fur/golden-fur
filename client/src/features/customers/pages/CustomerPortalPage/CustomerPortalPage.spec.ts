import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import { CreditBalanceContext } from '../../../credits/providers/CreditBalanceContext';
import type { CreditBalanceContextValue } from '../../../credits/providers/CreditBalanceContext';
import type { CreditBalance } from '../../../credits/credits.types';
import { getCustomerProfile } from '../../api/customer.api';
import { CustomerPortalPage } from './CustomerPortalPage';

vi.mock('../../api/customer.api', () => ({
  getCustomerProfile: vi.fn(),
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
  });

  it('greets the customer by name once their profile loads, instead of a navigation tile grid', async () => {
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
    expect(
      screen.queryByRole('link', { name: /book a service/i })
    ).not.toBeInTheDocument();
  });

  it('shows a generic welcome before the profile has loaded', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Welcome back!' })
    ).toBeInTheDocument();
  });

  it('links to the dedicated credits page when the customer has credit', () => {
    renderPage({ total: 500, balances: [balance({ balance: 500 })] });

    const link = screen.getByRole('link', { name: /account credit/i });
    expect(link).toHaveAttribute('href', '/portal/credits');
    expect(link).toHaveTextContent('₱500.00');
  });

  it('shows no credit summary when the customer has no credit anywhere', () => {
    renderPage();

    expect(screen.queryByText(/account credit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/₱/)).not.toBeInTheDocument();
  });
});
