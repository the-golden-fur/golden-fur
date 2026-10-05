import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFaq,
  deleteFaq,
  listAllFaqs,
  listPublicFaqs,
  updateFaq,
} from './faq.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface RecordedCall {
  method: string;
  args: unknown[];
}

const calls: RecordedCall[] = [];

/** One queued result per `from()` call, in order; every builder call is
 * recorded so a test can assert what was written and how it was filtered. */
function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of [
      'select',
      'eq',
      'order',
      'limit',
      'insert',
      'update',
      'delete',
    ]) {
      builder[method] = vi.fn((...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      });
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

function written(method: 'insert' | 'update') {
  return calls.filter((call) => call.method === method).map((c) => c.args[0]);
}

const FAQ = {
  id: 'faq-1',
  question: 'How do I book a service?',
  answer: 'Use Book a Service.',
  sort_order: 1,
  is_active: true,
  created_at: '2026-10-06T00:00:00.000Z',
  updated_at: '2026-10-06T00:00:00.000Z',
};

describe('faq.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
  });

  describe('listPublicFaqs', () => {
    it('returns only shown FAQs, in their set order, as question and answer', async () => {
      queueFromResults({
        data: [
          { id: 'faq-1', question: 'Q1', answer: 'A1' },
          { id: 'faq-2', question: 'Q2', answer: 'A2' },
        ],
        error: null,
      });

      await expect(listPublicFaqs()).resolves.toEqual([
        { id: 'faq-1', question: 'Q1', answer: 'A1' },
        { id: 'faq-2', question: 'Q2', answer: 'A2' },
      ]);

      expect(calls).toContainEqual({ method: 'eq', args: ['is_active', true] });
      expect(calls).toContainEqual({
        method: 'select',
        args: ['id, question, answer'],
      });
      expect(calls).toContainEqual({
        method: 'order',
        args: ['sort_order', { ascending: true }],
      });
    });
  });

  describe('listAllFaqs', () => {
    it('includes hidden FAQs for the settings screen', async () => {
      queueFromResults({
        data: [FAQ, { ...FAQ, id: 'faq-2', is_active: false }],
        error: null,
      });

      const faqs = await listAllFaqs();

      expect(faqs).toHaveLength(2);
      expect(calls.some((call) => call.method === 'eq')).toBe(false);
    });
  });

  describe('createFaq', () => {
    it('adds the new FAQ at the end of the list', async () => {
      queueFromResults(
        { data: { sort_order: 6 }, error: null }, // current last
        { data: { ...FAQ, id: 'faq-new', sort_order: 7 }, error: null }
      );

      const created = await createFaq({
        question: 'Do you offer pick-up?',
        answer: 'Not yet.',
      });

      expect(created.sort_order).toBe(7);
      expect(written('insert')[0]).toEqual({
        question: 'Do you offer pick-up?',
        answer: 'Not yet.',
        sort_order: 7,
      });
    });

    it('starts at 1 when there are no FAQs yet', async () => {
      queueFromResults(
        { data: null, error: null },
        { data: { ...FAQ, sort_order: 1 }, error: null }
      );

      await createFaq({ question: 'Q', answer: 'A' });

      expect(written('insert')[0]).toMatchObject({ sort_order: 1 });
    });
  });

  describe('updateFaq', () => {
    it('changes only the fields it was given', async () => {
      queueFromResults({ data: { ...FAQ, is_active: false }, error: null });

      const updated = await updateFaq('faq-1', { is_active: false });

      expect(updated.is_active).toBe(false);
      const payload = written('update')[0] as Record<string, unknown>;
      expect(payload.is_active).toBe(false);
      expect(payload).not.toHaveProperty('question');
      expect(payload).not.toHaveProperty('answer');
      expect(payload.updated_at).toEqual(expect.any(String));
    });

    it('404s when the FAQ does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(
        updateFaq('missing', { question: 'Q' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deleteFaq', () => {
    it('deletes the FAQ', async () => {
      queueFromResults({ data: { id: 'faq-1' }, error: null });

      await expect(deleteFaq('faq-1')).resolves.toBeUndefined();
      expect(calls).toContainEqual({ method: 'eq', args: ['id', 'faq-1'] });
    });

    it('404s when the FAQ does not exist', async () => {
      queueFromResults({ data: null, error: null });

      await expect(deleteFaq('missing')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
