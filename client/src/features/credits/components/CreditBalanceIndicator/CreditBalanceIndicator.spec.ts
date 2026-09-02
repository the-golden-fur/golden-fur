import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreditBalanceContext } from '../../providers/CreditBalanceContext';
import type { CreditBalanceContextValue } from '../../providers/CreditBalanceContext';
import type { CreditBalance } from '../../credits.types';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import { CreditBalanceIndicator } from './CreditBalanceIndicator';

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
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

function renderIndicator(overrides: Partial<CreditBalanceContextValue> = {}) {
  const value: CreditBalanceContextValue = {
    balances: [],
    total: 0,
    isLoading: false,
    refresh: vi.fn(),
    ...overrides,
  };

  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(
        CreditBalanceContext.Provider,
        { value },
        createElement(CreditBalanceIndicator)
      )
    )
  );
}

describe('CreditBalanceIndicator', () => {
  beforeEach(() => {
    vi.mocked(listBranches).mockResolvedValue({
      data: [{ id: 'branch-1', name: 'Makati', is_vet_branch: false }],
      error: null,
    });
  });

  it('renders the summed total as a link to the dedicated credits page', () => {
    renderIndicator({ total: 1750.5 });

    const link = screen.getByRole('link', {
      name: /account credit: ₱1,750\.50/i,
    });
    expect(link).toHaveAttribute('href', '/portal/credits');
    expect(link).toHaveTextContent('₱1,750.50');
  });

  it('still renders (₱0.00) when the customer has no credit', () => {
    renderIndicator({ total: 0 });

    const link = screen.getByRole('link', {
      name: /account credit: ₱0\.00/i,
    });
    expect(link).toHaveTextContent('₱0.00');
  });

  it('renders ₱0.00 while the balance is still loading', () => {
    renderIndicator({ total: 0, isLoading: true });

    expect(screen.getByRole('link')).toHaveTextContent('₱0.00');
  });

  it('reveals a per-branch breakdown with the soonest expiry on hover', async () => {
    const user = userEvent.setup();
    renderIndicator({
      total: 500,
      balances: [
        balance({
          balance: 500,
          next_expires_at: '2099-01-15T23:59:59.999Z',
          next_expires_amount: 500,
        }),
      ],
    });

    await user.hover(screen.getByRole('link', { name: /account credit/i }));

    expect(await screen.findByText('Makati')).toBeInTheDocument();
    expect(screen.getByText(/₱500\.00 expires/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view credit details/i })
    ).toHaveAttribute('href', '/portal/credits');
  });

  it('does not open a popover when the customer has no funded branches', async () => {
    const user = userEvent.setup();
    renderIndicator({ total: 0, balances: [] });

    await user.hover(screen.getByRole('link'));

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });
});
