import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../../app.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

const storageBucket = {
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
};

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn(() => storageBucket) },
  },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

/** One resolved result per supabase.from(...) call, in call order -
 * requireRole's staff_profiles lookup first, then the service's queries. */
function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    for (const method of [
      'select',
      'eq',
      'in',
      'or',
      'order',
      'is',
      'not',
      'update',
      'insert',
      'upsert',
      'delete',
    ]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.single = vi.fn(() => Promise.resolve(result));
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

function mockCaller(sub: string) {
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: { id: sub } },
    error: null,
  } as never);
  vi.spyOn(jwt, 'decode').mockReturnValue({ sub } as never);
}

const PAID_TXN = {
  id: 'txn-1',
  payment_status: 'Fully Paid',
  receipt_path: null,
};

describe('payment receipts HTTP surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageBucket.upload.mockResolvedValue({ data: {}, error: null });
    storageBucket.remove.mockResolvedValue({ data: [], error: null });
  });

  it.each(['Cashier', 'Front Desk'])(
    'a %s can attach a receipt to a paid transaction',
    async (role) => {
      mockCaller('staff-1');
      queueFromResults(
        { data: { role }, error: null },
        { data: PAID_TXN, error: null },
        { data: null, error: null } // update
      );

      const res = await request(app)
        .post('/billing/transactions/txn-1/receipt')
        .set('Authorization', 'Bearer token')
        .attach('receipt', Buffer.from('png-bytes'), {
          filename: 'gcash.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(200);
      expect(res.body.receipt_path).toMatch(/^txn-1\/.+\.png$/);
    }
  );

  it('is billing-staff only (a Groomer gets 403)', async () => {
    mockCaller('groomer-1');
    queueFromResults({ data: { role: 'Groomer' }, error: null });

    const res = await request(app)
      .post('/billing/transactions/txn-1/receipt')
      .set('Authorization', 'Bearer token')
      .attach('receipt', Buffer.from('png-bytes'), {
        filename: 'gcash.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(403);
    expect(storageBucket.upload).not.toHaveBeenCalled();
  });

  it('400s when no file is sent', async () => {
    mockCaller('staff-1');
    queueFromResults({ data: { role: 'Cashier' }, error: null });

    const res = await request(app)
      .post('/billing/transactions/txn-1/receipt')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Choose a receipt file to upload');
  });

  it('GET returns a signed link to view the receipt', async () => {
    mockCaller('staff-1');
    queueFromResults(
      { data: { role: 'Cashier' }, error: null },
      { data: { ...PAID_TXN, receipt_path: 'txn-1/a.png' }, error: null }
    );
    storageBucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/a.png' },
      error: null,
    });

    const res = await request(app)
      .get('/billing/transactions/txn-1/receipt')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://signed.example/a.png');
  });
});
