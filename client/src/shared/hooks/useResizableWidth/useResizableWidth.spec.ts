import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useResizableWidth } from './useResizableWidth';

function keyEvent(key: string) {
  return {
    key,
    preventDefault: () => {},
  } as unknown as KeyboardEvent<HTMLDivElement>;
}

describe('useResizableWidth', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('starts at the default width when nothing is stored', () => {
    const { result } = renderHook(() =>
      useResizableWidth({
        storageKey: 'test-width-1',
        defaultWidth: 264,
        min: 200,
        max: 420,
      })
    );

    expect(result.current.width).toBe(264);
  });

  it('reads a previously persisted width, clamped to min/max', () => {
    window.localStorage.setItem('test-width-2', '999');

    const { result } = renderHook(() =>
      useResizableWidth({
        storageKey: 'test-width-2',
        defaultWidth: 264,
        min: 200,
        max: 420,
      })
    );

    expect(result.current.width).toBe(420);
  });

  it('ArrowRight/ArrowLeft resize by a fixed step and persist immediately', () => {
    const { result } = renderHook(() =>
      useResizableWidth({
        storageKey: 'test-width-3',
        defaultWidth: 264,
        min: 200,
        max: 420,
      })
    );

    act(() => {
      result.current.handleProps.onKeyDown(keyEvent('ArrowRight'));
    });

    expect(result.current.width).toBe(280);
    expect(window.localStorage.getItem('test-width-3')).toBe('280');

    act(() => {
      result.current.handleProps.onKeyDown(keyEvent('ArrowLeft'));
      result.current.handleProps.onKeyDown(keyEvent('ArrowLeft'));
    });

    expect(result.current.width).toBe(248);
  });

  it('clamps keyboard resizing at min/max', () => {
    const { result } = renderHook(() =>
      useResizableWidth({
        storageKey: 'test-width-4',
        defaultWidth: 205,
        min: 200,
        max: 420,
      })
    );

    act(() => {
      result.current.handleProps.onKeyDown(keyEvent('ArrowLeft'));
      result.current.handleProps.onKeyDown(keyEvent('ArrowLeft'));
    });

    expect(result.current.width).toBe(200);
  });

  it('exposes the current width via aria-valuenow/min/max on the handle', () => {
    const { result } = renderHook(() =>
      useResizableWidth({
        storageKey: 'test-width-5',
        defaultWidth: 264,
        min: 200,
        max: 420,
      })
    );

    expect(result.current.handleProps['aria-valuenow']).toBe(264);
    expect(result.current.handleProps['aria-valuemin']).toBe(200);
    expect(result.current.handleProps['aria-valuemax']).toBe(420);
    expect(result.current.handleProps.role).toBe('separator');
  });
});
