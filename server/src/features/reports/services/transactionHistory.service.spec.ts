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
function stubQuery(result: QueryResult) {
  const selectArgs: string[] = [];
  const eqCalls: Array<[string, unknown]> = [];
  const builder: Record<string, unknown> = {};

  builder.select = vi.fn((arg: string) => {
    selectArgs.push(arg);
    return builder;
  });
  builder.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push([column, value]);
    return builder;
  });
  for (const method of ['gte', 'lt']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.order = vi.fn(() => Promise.resolve(result));

  vi.mocked(supabase.from).mockReturnValue(builder as never);

  return { selectArgs, eqCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listTransactionHistory', () => {
  it('uses a plain (left) bookings join when neither pet nor service filter is set, so misc sales still show', async () => {
    const { selectArgs } = stubQuery({ data: [], error: null });

    await listTransactionHistory({ customerId: 'cust-1' });

    expect(selectArgs[0]).toContain('bookings(pet_id, service_category)');
    expect(selectArgs[0]).not.toContain('!inner');
  });

  it('switches to an !inner join once a service-category filter is requested', async () => {
    const { selectArgs } = stubQuery({ data: [], error: null });

    await listTransactionHistory({ serviceCategory: 'Grooming' });

    expect(selectArgs[0]).toContain('bookings!inner(pet_id, service_category)');
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
});
