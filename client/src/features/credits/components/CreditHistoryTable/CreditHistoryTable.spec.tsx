import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CreditHistoryTable } from './CreditHistoryTable';
import type { CreditTransaction } from '../../credits.types';

function buildTxn(
  overrides: Partial<CreditTransaction> = {}
): CreditTransaction {
  return {
    id: 'txn-1',
    credit_balance_id: 'balance-1',
    transaction_type: 'issuance',
    amount: 100,
    cancellation_log_id: null,
    transaction_id: null,
    expires_at: null,
    expired_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CreditHistoryTable', () => {
  it('shows the empty state when there is no history', () => {
    render(<CreditHistoryTable history={[]} />);
    expect(
      screen.getByText('No credit history for this branch yet.')
    ).toBeInTheDocument();
  });

  it('renders one row per transaction, with issued shown as a positive amount', () => {
    render(
      <CreditHistoryTable
        history={[
          buildTxn({ id: '1', transaction_type: 'issuance', amount: 100 }),
          buildTxn({ id: '2', transaction_type: 'redemption', amount: -40 }),
        ]}
      />
    );

    expect(screen.getByText('Issued')).toBeInTheDocument();
    expect(screen.getByText('Redeemed')).toBeInTheDocument();
    expect(screen.getByText('₱100.00')).toBeInTheDocument();
    expect(screen.getByText('-₱40.00')).toBeInTheDocument();
  });

  it('Notion-style remaster (session 110): a Type filter tile narrows the rows shown', async () => {
    const user = userEvent.setup();

    render(
      <CreditHistoryTable
        history={[
          buildTxn({ id: '1', transaction_type: 'issuance' }),
          buildTxn({ id: '2', transaction_type: 'redemption' }),
        ]}
      />
    );

    expect(screen.getByText('Issued')).toBeInTheDocument();
    expect(screen.getByText('Redeemed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Type' }));

    // Type defaults to Issued once added.
    const table = screen.getByRole('table');
    expect(within(table).getByText('Issued')).toBeInTheDocument();
    expect(within(table).queryByText('Redeemed')).not.toBeInTheDocument();
  });

  it('sorting by Amount reorders the rows', async () => {
    const user = userEvent.setup();

    render(
      <CreditHistoryTable
        history={[
          buildTxn({ id: '1', amount: 50 }),
          buildTxn({ id: '2', amount: 200 }),
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Sort' }));
    await user.click(
      screen.getByRole('menuitem', { name: 'Amount · High to low' })
    );

    const amountCells = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent ?? '');
    expect(amountCells[0]).toContain('₱200.00');
    expect(amountCells[1]).toContain('₱50.00');
  });
});
