import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNowMs } from './useNowMs';

describe('useNowMs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T01:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('has the current time immediately, from the lazy useState initializer', () => {
    const { result } = renderHook(() => useNowMs());

    expect(result.current).toBe(new Date('2026-08-03T01:00:00.000Z').getTime());
  });

  it('refreshes on the given interval', () => {
    const { result } = renderHook(() => useNowMs(1_000));

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(result.current).toBe(
      new Date('2026-08-03T01:00:01.000Z').getTime()
    );
  });
});
