import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInactivityTimeout } from './useInactivityTimeout';

describe('useInactivityTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the warning before the inactivity threshold', () => {
    const onTimeout = vi.fn();

    const { result } = renderHook(() =>
      useInactivityTimeout({
        thresholdMs: 10_000,
        warningMs: 3_000,
        onTimeout,
      })
    );

    act(() => {
      vi.advanceTimersByTime(7_000);
    });

    expect(result.current.isWarningVisible).toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('fires timeout when the threshold elapses', () => {
    const onTimeout = vi.fn();

    renderHook(() =>
      useInactivityTimeout({
        thresholdMs: 10_000,
        warningMs: 3_000,
        onTimeout,
      })
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(onTimeout).toHaveBeenCalled();
  });

  it('resets the warning when the user stays signed in', () => {
    const onTimeout = vi.fn();

    const { result } = renderHook(() =>
      useInactivityTimeout({
        thresholdMs: 10_000,
        warningMs: 3_000,
        onTimeout,
      })
    );

    act(() => {
      vi.advanceTimersByTime(7_000);
    });

    expect(result.current.isWarningVisible).toBe(true);

    act(() => {
      result.current.staySignedIn();
    });

    expect(result.current.isWarningVisible).toBe(false);
    expect(result.current.remainingMs).toBe(10_000);
  });

  it('does not run when disabled', () => {
    const onTimeout = vi.fn();

    const { result } = renderHook(() =>
      useInactivityTimeout({
        thresholdMs: 10_000,
        warningMs: 3_000,
        enabled: false,
        onTimeout,
      })
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.isWarningVisible).toBe(false);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
