import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listTransactionHistory } from './transactionHistory.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/** Records the select string + every .eq(column, value) so a test can
 * assert which filters were applied, and resolves .order() with `result`. */
function stubQuery(result: QueryResult, customerRows: unknown = { data: [] }) {
  const selectArgs: string[] = [];
  const eqCalls: Array<[string, unknown]> = [];

  // The transactions query builder: select/eq/gte/lt chain, resolves on order().
  const txnBuilder: Record<string, unknown> = {};
  txnBuilder.select = vi.fn((arg: string) => {
    selectArgs.push(arg);
    return txnBuilder;
  });
  txnBuilder.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push([column, value]);
    return txnBuilder;
  });
  for (const method of ['gte', 'lt']) {
    txnBuilder[method] = vi.fn(() => txnBuilder);
  }
  txnBuilder.order = vi.fn(() => Promise.resolve(result));

  // The customer_profiles name-hydration query: select(...).in(...) resolves.
  const customerBuilder: Record<string, unknown> = {};
  customerBuilder.select = vi.fn(() => customerBuilder);
  customerBuilder.in = vi.fn(() => Promise.resolve(customerRows));

  vi.mocked(supabase.from).mockImplementation(
    (table: string) =>
      (table === 'customer_profiles' ? customerBuilder : txnBuilder) as never
  );

  return { selectArgs, eqCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listTransactionHistory', () => {
  it('uses a plain (left) bookings join when neither pet nor service filter is set, so misc sales still show', async () => {
    const { selectArgs } = stubQuery({ data: [], error: null });

    await listTransactionHistory({ customerId: 'cust-1' });

    expect(selectArgs[0]).toContain('bookings(pet_id, service_category');
    expect(selectArgs[0]).not.toContain('!inner');
  });

  it('switches to an !inner join once a service-category filter is requested', async () => {
    const { selectArgs } = stubQuery({ data: [], error: null });

    await listTransactionHistory({ serviceCategory: 'Grooming' });

    expect(selectArgs[0]).toContain('bookings!inner(pet_id, service_category');
  });

  it('applies the transaction_type and payment_choice filters', async () => {
    const { eqCalls } = stubQuery({ data: [], error: null });

    await listTransactionHistory({
      transactionType: 'booking_payment',
      paymentChoice: 'downpayment',
    });

    expect(eqCalls).toContainEqual(['transaction_type', 'booking_payment']);
    expect(eqCalls).toContainEqual(['payment_choice', 'downpayment']);
  });

  it('throws a 400 when the query errors', async () => {
    stubQuery({ data: null, error: { message: 'boom' } });

    await expect(listTransactionHistory({})).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("merges each row's owner display name from a batched customer_profiles lookup", async () => {
    stubQuery(
      {
        data: [
          { id: 'txn-1', customer_id: 'cust-1' },
          { id: 'txn-2', customer_id: 'cust-2' },
          { id: 'txn-3', customer_id: 'cust-1' },
        ],
        error: null,
      },
      {
        data: [
          { id: 'cust-1', full_name: 'Ada Lovelace' },
          { id: 'cust-2', full_name: 'Grace Hopper' },
        ],
      }
    );

    const rows = await listTransactionHistory({});

    expect(rows.map((row) => row.customer_name)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Ada Lovelace',
    ]);
  });

  it('falls back to a null customer_name when the profile is missing', async () => {
    stubQuery(
      { data: [{ id: 'txn-1', customer_id: 'ghost' }], error: null },
      { data: [] }
    );

    const [row] = await listTransactionHistory({});

    expect(row.customer_name).toBeNull();
  });
});
