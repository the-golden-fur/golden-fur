import { describe, expect, it } from 'vitest';
import {
  applyCreditHistoryFilters,
  CREDIT_HISTORY_COMPARATORS,
  deriveCreditHistorySortKey,
} from './creditHistoryFields';
import type { FilterTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import type { CreditTransaction } from '../../credits.types';

function buildTxn(overrides: Partial<CreditTransaction> = {}): CreditTransaction {
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

describe('applyCreditHistoryFilters', () => {
  const history = [
    buildTxn({ id: '1', transaction_type: 'issuance' }),
    buildTxn({ id: '2', transaction_type: 'redemption' }),
  ];

  it('narrows to one type when a type tile is present', () => {
    const tiles: FilterTile[] = [{ fieldId: 'type', value: 'redemption' }];
    expect(applyCreditHistoryFilters(history, tiles).map((t) => t.id)).toEqual([
      '2',
    ]);
  });

  it('returns everything when there are no tiles', () => {
    expect(applyCreditHistoryFilters(history, []).map((t) => t.id)).toEqual([
      '1',
      '2',
    ]);
  });
});

describe('deriveCreditHistorySortKey + CREDIT_HISTORY_COMPARATORS', () => {
  it('defaults to date-desc', () => {
    expect(deriveCreditHistorySortKey(null)).toBe('date-desc');
  });

  it('sorts by date, newest first', () => {
    const history = [
      buildTxn({ id: '1', created_at: '2026-01-01T00:00:00.000Z' }),
      buildTxn({ id: '2', created_at: '2026-03-01T00:00:00.000Z' }),
    ];
    expect(
      [...history].sort(CREDIT_HISTORY_COMPARATORS['date-desc']).map((t) => t.id)
    ).toEqual(['2', '1']);
  });

  it('sorts by amount, high to low', () => {
    const history = [
      buildTxn({ id: '1', amount: 50 }),
      buildTxn({ id: '2', amount: 200 }),
    ];
    expect(
      [...history]
        .sort(CREDIT_HISTORY_COMPARATORS['amount-desc'])
        .map((t) => t.id)
    ).toEqual(['2', '1']);
  });
});
