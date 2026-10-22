import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PHONE_MEDIA_QUERY, useMediaQuery } from './useMediaQuery';

type ChangeListener = () => void;

function mockMatchMedia(initial: boolean) {
  const listeners = new Set<ChangeListener>();
  const media = {
    matches: initial,
    addEventListener: vi.fn((_type: string, listener: ChangeListener) =>
      listeners.add(listener)
    ),
    removeEventListener: vi.fn((_type: string, listener: ChangeListener) =>
      listeners.delete(listener)
    ),
  };

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media)
  );

  return {
    media,
    setMatches(next: boolean) {
      media.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports the current match', () => {
    mockMatchMedia(true);

    const { result } = renderHook(() => useMediaQuery(PHONE_MEDIA_QUERY));

    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 768px)');
  });

  it('updates when the viewport crosses the breakpoint', () => {
    const control = mockMatchMedia(false);

    const { result } = renderHook(() => useMediaQuery(PHONE_MEDIA_QUERY));
    expect(result.current).toBe(false);

    act(() => control.setMatches(true));

    expect(result.current).toBe(true);
  });

  it('stops listening on unmount', () => {
    const control = mockMatchMedia(false);

    const { unmount } = renderHook(() => useMediaQuery(PHONE_MEDIA_QUERY));
    unmount();

    expect(control.media.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('falls back to the desktop layout without matchMedia (jsdom)', () => {
    vi.stubGlobal('matchMedia', undefined);

    const { result } = renderHook(() => useMediaQuery(PHONE_MEDIA_QUERY));

    expect(result.current).toBe(false);
  });
});
