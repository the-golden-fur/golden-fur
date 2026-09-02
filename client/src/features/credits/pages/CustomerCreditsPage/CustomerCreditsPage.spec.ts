import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import { CreditBalanceContext } from '../../providers/CreditBalanceContext';
import type { CreditBalanceContextValue } from '../../providers/CreditBalanceContext';
import type { CreditBalance, CreditTransaction } from '../../credits.types';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import { listCreditHistory } from '../../api/credits.api';
import { CustomerCreditsPage } from './CustomerCreditsPage';

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../api/credits.api', () => ({
  listCreditHistory: vi.fn(),
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

function issuance(
  amount: number,
  expires_at: string | null
): CreditTransaction {
  return {
    id: `txn-${amount}`,
    credit_balance_id: 'bal-1',
    transaction_type: 'issuance',
    amount,
    cancellation_log_id: null,
    transaction_id: null,
    expires_at,
    expired_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
  };
}

function renderPage(credit: Partial<CreditBalanceContextValue> = {}) {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'customer-1', email: 'c@example.com' },
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
          createElement(CustomerCreditsPage)
        )
      )
    )
  );
}

describe('CustomerCreditsPage', () => {
  beforeEach(() => {
    vi.mocked(listBranches).mockResolvedValue({
      data: [{ id: 'branch-1', name: 'Makati', is_vet_branch: false }],
      error: null,
    });
    vi.mocked(listCreditHistory).mockResolvedValue({ data: [], error: null });
  });

  it('shows an empty state when the customer has no credit', () => {
    renderPage();
    expect(
      screen.getByText(/don't have any account credit/i)
    ).toBeInTheDocument();
  });

  it('lists a per-branch section with balance and soonest expiry', async () => {
    vi.mocked(listCreditHistory).mockResolvedValue({
      data: [issuance(500, '2099-02-01T23:59:59.999Z')],
      error: null,
    });

    renderPage({ total: 500, balances: [balance({ balance: 500 })] });

    expect(await screen.findByText('Makati')).toBeInTheDocument();
    expect(screen.getAllByText('₱500.00').length).toBeGreaterThan(0);
    expect(
      await screen.findByText(/₱500\.00 expires .* left/)
    ).toBeInTheDocument();
  });

  it('expands to a full expiry schedule and history', async () => {
    const user = userEvent.setup();
    vi.mocked(listCreditHistory).mockResolvedValue({
      data: [
        issuance(300, '2099-02-01T23:59:59.999Z'),
        issuance(200, '2099-05-01T23:59:59.999Z'),
      ],
      error: null,
    });

    renderPage({ total: 500, balances: [balance({ balance: 500 })] });

    await user.click(
      await screen.findByRole('button', { name: /show expiry schedule/i })
    );

    expect(screen.getByText('Expiry schedule')).toBeInTheDocument();
    // Two schedule rows (₱300 then ₱200) plus the raw history table.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByText('₱300.00').length).toBeGreaterThan(0);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('says a branch does not expire when every lot is open-ended', async () => {
    vi.mocked(listCreditHistory).mockResolvedValue({
      data: [issuance(500, null)],
      error: null,
    });

    renderPage({ total: 500, balances: [balance({ balance: 500 })] });

    await waitFor(() =>
      expect(screen.getByText('Does not expire')).toBeInTheDocument()
    );
  });
});
