import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCagePickerOptions,
  isCagePickerEnabled,
  verifyCagePreference,
} from './cagePicker.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation(() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder as never;
  });
}

describe('cagePicker.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isCagePickerEnabled', () => {
    it('is always false for a non-Hotel category, without querying', async () => {
      const result = await isCagePickerEnabled('Grooming');

      expect(result).toBe(false);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('reads the Hotel service type row cage_picker_enabled toggle', async () => {
      queueFromResults({ data: { cage_picker_enabled: true }, error: null });

      const result = await isCagePickerEnabled('Hotel');

      expect(result).toBe(true);
    });

    it('defaults to false when no service_types row exists for Hotel', async () => {
      queueFromResults({ data: null, error: null });

      const result = await isCagePickerEnabled('Hotel');

      expect(result).toBe(false);
    });
  });

  describe('getCagePickerOptions', () => {
    it('returns cage_picker_enabled: false and no options when disabled', async () => {
      queueFromResults({ data: { cage_picker_enabled: false }, error: null });

      const result = await getCagePickerOptions('branch-1', 'Hotel');

      expect(result).toEqual({ cage_picker_enabled: false, options: [] });
    });

    it('lists "No preference" first, then every Available cage', async () => {
      queueFromResults(
        { data: { cage_picker_enabled: true }, error: null },
        {
          data: [
            { id: 'cage-1', cage_label: 'A1', size: 'S', status: 'Available' },
            { id: 'cage-2', cage_label: 'A2', size: 'M', status: 'Available' },
          ],
          error: null,
        }
      );

      const result = await getCagePickerOptions('branch-1', 'Hotel');

      expect(result.cage_picker_enabled).toBe(true);
      expect(result.options[0]).toEqual({ type: 'no_preference' });
      expect(result.options).toHaveLength(3);
    });
  });

  describe('verifyCagePreference', () => {
    it('returns the cage id when it is still Available at the branch', async () => {
      queueFromResults({ data: { id: 'cage-1' }, error: null });

      const result = await verifyCagePreference('cage-1', 'branch-1');

      expect(result).toBe('cage-1');
    });

    it('returns null when the cage is no longer Available', async () => {
      queueFromResults({ data: null, error: null });

      const result = await verifyCagePreference('cage-1', 'branch-1');

      expect(result).toBeNull();
    });

    it('returns the cage id when a requiredSize is given and the cage matches it (Custom change: cage size booking restriction)', async () => {
      queueFromResults({ data: { id: 'cage-1' }, error: null });

      const result = await verifyCagePreference('cage-1', 'branch-1', 'S');

      expect(result).toBe('cage-1');
    });

    it('degrades to null (same as an unavailable cage) when the cage does not match requiredSize', async () => {
      queueFromResults({ data: null, error: null });

      const result = await verifyCagePreference('cage-1', 'branch-1', 'M');

      expect(result).toBeNull();
    });
  });
});
