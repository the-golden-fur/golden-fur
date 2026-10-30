import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachTransactionReceipt,
  getTransactionReceiptUrl,
} from './paymentReceipt.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

const storageBucket = {
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
};

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn(() => storageBucket) },
  },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

const updates: unknown[] = [];

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.update = vi.fn((payload: unknown) => {
      updates.push(payload);
      return builder;
    });
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

const PNG = {
  buffer: Buffer.from('png'),
  mimetype: 'image/png',
  originalname: 'gcash.png',
  size: 1024,
};

describe('paymentReceipt.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    storageBucket.upload.mockResolvedValue({ data: {}, error: null });
    storageBucket.remove.mockResolvedValue({ data: [], error: null });
  });

  describe('attachTransactionReceipt', () => {
    it('rejects a file that is not an image or PDF, or is over 5 MB', async () => {
      await expect(
        attachTransactionReceipt({
          requesterId: 'cashier-1',
          transactionId: 'txn-1',
          file: { ...PNG, mimetype: 'text/plain' },
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      await expect(
        attachTransactionReceipt({
          requesterId: 'cashier-1',
          transactionId: 'txn-1',
          file: { ...PNG, size: 6 * 1024 * 1024 },
        })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(storageBucket.upload).not.toHaveBeenCalled();
    });

    it('refuses a transaction that has not been paid yet', async () => {
      queueFromResults({
        data: { id: 'txn-1', payment_status: 'Pending', receipt_path: null },
        error: null,
      });

      await expect(
        attachTransactionReceipt({
          requesterId: 'cashier-1',
          transactionId: 'txn-1',
          file: PNG,
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Mark the transaction as paid first',
      });
      expect(storageBucket.upload).not.toHaveBeenCalled();
    });

    it('stores the file under the transaction and stamps who uploaded it', async () => {
      queueFromResults(
        {
          data: {
            id: 'txn-1',
            payment_status: 'Fully Paid',
            receipt_path: null,
          },
          error: null,
        },
        { data: null, error: null } // update
      );

      const result = await attachTransactionReceipt({
        requesterId: 'cashier-1',
        transactionId: 'txn-1',
        file: PNG,
      });

      expect(result.receipt_path).toMatch(/^txn-1\/.+\.png$/);
      expect(storageBucket.upload).toHaveBeenCalledWith(
        result.receipt_path,
        PNG.buffer,
        { contentType: 'image/png', upsert: false }
      );
      expect(updates[0]).toMatchObject({
        receipt_path: result.receipt_path,
        receipt_uploaded_by: 'cashier-1',
      });
      expect(storageBucket.remove).not.toHaveBeenCalled();
    });

    it('replacing a receipt removes the old file', async () => {
      queueFromResults(
        {
          data: {
            id: 'txn-1',
            payment_status: 'Partially Paid',
            receipt_path: 'txn-1/old.jpg',
          },
          error: null,
        },
        { data: null, error: null }
      );

      await attachTransactionReceipt({
        requesterId: 'front-desk-1',
        transactionId: 'txn-1',
        file: { ...PNG, mimetype: 'application/pdf' },
      });

      expect(storageBucket.remove).toHaveBeenCalledWith(['txn-1/old.jpg']);
    });
  });

  describe('getTransactionReceiptUrl', () => {
    it('404s when the transaction has no receipt', async () => {
      queueFromResults({
        data: { id: 'txn-1', payment_status: 'Fully Paid', receipt_path: null },
        error: null,
      });

      await expect(getTransactionReceiptUrl('txn-1')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('returns a short-lived signed link', async () => {
      queueFromResults({
        data: {
          id: 'txn-1',
          payment_status: 'Fully Paid',
          receipt_path: 'txn-1/a.png',
        },
        error: null,
      });
      storageBucket.createSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://signed.example/a.png' },
        error: null,
      });

      await expect(getTransactionReceiptUrl('txn-1')).resolves.toBe(
        'https://signed.example/a.png'
      );
      expect(storageBucket.createSignedUrl).toHaveBeenCalledWith(
        'txn-1/a.png',
        600
      );
    });
  });
});
