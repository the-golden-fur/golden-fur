import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

interface UseResizableWidthOptions {
  /** localStorage key this width is persisted under - best-effort only, same
   * as every other UI-preference key in this app (a private-browsing quota
   * error shouldn't block resizing from working for the rest of the
   * session). */
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
}

function readStoredWidth(
  storageKey: string,
  defaultWidth: number,
  min: number,
  max: number
): number {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, parsed))
      : defaultWidth;
  } catch {
    return defaultWidth;
  }
}

/**
 * Drag-to-resize a panel width, shared by the dashboard Sidebar and the
 * Settings modal's own sidebar - a single pointer-drag implementation
 * (pointer capture, so the drag keeps tracking even if the cursor leaves the
 * handle) rather than duplicating the same mousemove/mouseup wiring twice.
 * Returns the current width plus the props to spread onto a `role="separator"`
 * drag handle element.
 */
export function useResizableWidth({
  storageKey,
  defaultWidth,
  min,
  max,
}: UseResizableWidthOptions) {
  const [width, setWidth] = useState(() =>
    readStoredWidth(storageKey, defaultWidth, min, max)
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(
    null
  );

  const persist = useCallback(
    (value: number) => {
      try {
        window.localStorage.setItem(storageKey, String(value));
      } catch {
        // best-effort only
      }
    },
    [storageKey]
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      dragStateRef.current = { startX: event.clientX, startWidth: width };
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const delta = event.clientX - dragState.startX;
      setWidth(Math.min(max, Math.max(min, dragState.startWidth + delta)));
    },
    [min, max]
  );

  const endDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;
      setIsDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
      setWidth((current) => {
        persist(current);
        return current;
      });
    },
    [persist]
  );

  // Keyboard resize (arrow keys), same left/right convention as the mouse
  // drag - a `role="separator"` needs a non-pointer way to operate per
  // WAI-ARIA, and this is the simplest one that matches the drag direction.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const step = 16;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setWidth((current) => {
          const next = Math.max(min, current - step);
          persist(next);
          return next;
        });
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setWidth((current) => {
          const next = Math.min(max, current + step);
          persist(next);
          return next;
        });
      }
    },
    [min, max, persist]
  );

  useEffect(() => {
    dragStateRef.current = null;
  }, [storageKey]);

  return {
    width,
    isDragging,
    handleProps: {
      role: 'separator' as const,
      'aria-orientation': 'vertical' as const,
      'aria-valuenow': Math.round(width),
      'aria-valuemin': min,
      'aria-valuemax': max,
      tabIndex: 0,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
    },
  };
}
