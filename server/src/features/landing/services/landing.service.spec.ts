import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLandingReview,
  getPublicLandingContent,
  updateLandingContent,
  updateLandingSection,
} from './landing.service.ts';
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
 * recorded - same helper as faq.service.spec.ts. */
function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of [
      'select',
      'eq',
      'in',
      'order',
      'limit',
      'insert',
      'update',
      'upsert',
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

describe('landing.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
  });

  describe('getPublicLandingContent', () => {
    it('flattens rows into key -> value maps and keeps only shown reviews', async () => {
      queueFromResults(
        {
          data: [
            { key: 'hero.title_lead', value: 'Care as warm as' },
            { key: 'hero.image', value: null },
          ],
          error: null,
        },
        {
          data: [
            { key: 'hero', is_visible: true },
            { key: 'reviews', is_visible: false },
          ],
          error: null,
        },
        { data: [], error: null }
      );

      await expect(getPublicLandingContent()).resolves.toEqual({
        content: { 'hero.title_lead': 'Care as warm as', 'hero.image': null },
        sections: { hero: true, reviews: false },
        reviews: [],
      });
      expect(calls).toContainEqual({ method: 'eq', args: ['is_active', true] });
    });
  });

  describe('updateLandingContent', () => {
    it('saves known text slots in one upsert, last edit of a key winning', async () => {
      queueFromResults(
        {
          data: [
            { key: 'hero.title_lead', kind: 'text' },
            { key: 'cta.title', kind: 'text' },
          ],
          error: null,
        },
        { data: [], error: null }
      );

      await updateLandingContent({
        updates: [
          { key: 'hero.title_lead', value: 'First' },
          { key: 'cta.title', value: 'Book now' },
          { key: 'hero.title_lead', value: 'Second' },
        ],
      });

      const upsert = calls.find((call) => call.method === 'upsert');
      expect(upsert?.args[0]).toEqual([
        expect.objectContaining({ key: 'hero.title_lead', value: 'Second' }),
        expect.objectContaining({ key: 'cta.title', value: 'Book now' }),
      ]);
      expect(upsert?.args[1]).toEqual({ onConflict: 'key' });
    });

    it('rejects the whole batch for an unknown key', async () => {
      queueFromResults({
        data: [{ key: 'hero.title_lead', kind: 'text' }],
        error: null,
      });

      await expect(
        updateLandingContent({
          updates: [
            { key: 'hero.title_lead', value: 'Hi' },
            { key: 'made.up', value: 'x' },
          ],
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(calls.some((call) => call.method === 'upsert')).toBe(false);
    });

    it('rejects setting an image slot as text', async () => {
      queueFromResults({
        data: [{ key: 'hero.image', kind: 'image' }],
        error: null,
      });

      await expect(
        updateLandingContent({
          updates: [{ key: 'hero.image', value: 'https://evil.example/x.png' }],
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(calls.some((call) => call.method === 'upsert')).toBe(false);
    });
  });

  describe('updateLandingSection', () => {
    it('404s for a section that does not exist, without querying', async () => {
      await expect(updateLandingSection('pricing', false)).rejects.toMatchObject(
        { statusCode: 404 }
      );
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('hides a section', async () => {
      queueFromResults({
        data: { key: 'reviews', is_visible: false },
        error: null,
      });

      await expect(updateLandingSection('reviews', false)).resolves.toEqual({
        key: 'reviews',
        is_visible: false,
      });
      expect(calls).toContainEqual({ method: 'eq', args: ['key', 'reviews'] });
    });
  });

  describe('createLandingReview', () => {
    it('adds the review at the end, with an empty detail when none is given', async () => {
      queueFromResults(
        { data: { sort_order: 5 }, error: null },
        { data: { id: 'r-6', sort_order: 6 }, error: null }
      );

      await createLandingReview({ quote: 'Lovely.', name: 'Ana', rating: 4 });

      const insert = calls.find((call) => call.method === 'insert');
      expect(insert?.args[0]).toEqual({
        quote: 'Lovely.',
        name: 'Ana',
        detail: '',
        rating: 4,
        sort_order: 6,
      });
    });
  });
});
