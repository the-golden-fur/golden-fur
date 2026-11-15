import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Info } from 'lucide-react';
import styles from './InfoPopover.module.css';

interface InfoPopoverProps {
  /** Accessible label for the trigger (e.g. "About walk-in bookings") -
   * every instance on a page needs its own so screen-reader users can tell
   * them apart. */
  label: string;
  /** The explanation shown when the ⓘ opens. */
  children: ReactNode;
  /** Which side the panel expands toward. Defaults to 'right' (panel's
   * right edge pins to the trigger) - correct for a trigger near the right
   * edge of a card. */
  align?: 'left' | 'right';
}

/** Mouse-leave doesn't close the panel immediately - a short delay lets the
 * cursor travel from the trigger into the panel itself (e.g. to select its
 * text) without it vanishing mid-move. */
const CLOSE_DELAY_MS = 150;

/**
 * A small "ⓘ" button that reveals a short explanation - for secondary help
 * text that would otherwise clutter a card or field label. Opens on mouse
 * hover (the primary interaction) and also on click (touch, where there's
 * no hover) or keyboard focus (Tab), so every input method can reach it.
 *
 * A click also "pins" the panel open so a touch/keyboard user isn't fighting
 * the hover-close timer - once pinned, moving the mouse away no longer
 * closes it; only a second click, an outside click, or Escape does (and
 * unpins it). Without this, hover-opening and click-toggling would race:
 * userEvent/real browsers fire a hover just before a click, so a plain
 * toggle-on-click would immediately re-close what the hover had just opened.
 *
 * The trigger is a `<span role="button">`, not a real `<button>`, on
 * purpose: callers routinely nest this right inside a field's own `<label>`
 * (next to the field's text) so the icon sits beside it. A real `<button>`
 * is an HTML "labelable" element, so a wrapping `<label>` would silently
 * create a SECOND implicit association with it alongside the actual field
 * control - breaking both real click-to-focus behaviour and any
 * `getByLabelText` query for that field's visible text, which would then
 * resolve to two elements instead of one. A `<span>` is never labelable,
 * sidestepping that regardless of where this component is placed.
 */
export function InfoPopover({
  label,
  children,
  align = 'right',
}: InfoPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isPinnedRef = useRef(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const panelId = useId();

  const cancelScheduledClose = useCallback(() => {
    clearTimeout(closeTimeoutRef.current);
  }, []);

  function scheduleClose() {
    cancelScheduledClose();
    closeTimeoutRef.current = setTimeout(() => {
      if (!isPinnedRef.current) setIsOpen(false);
    }, CLOSE_DELAY_MS);
  }

  const closeAndUnpin = useCallback(() => {
    cancelScheduledClose();
    isPinnedRef.current = false;
    setIsOpen(false);
  }, [cancelScheduledClose]);

  useEffect(() => cancelScheduledClose, [cancelScheduledClose]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeAndUnpin();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeAndUnpin();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeAndUnpin]);

  return (
    <span
      className={styles.container}
      ref={containerRef}
      onMouseEnter={() => {
        cancelScheduledClose();
        setIsOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <span
        role="button"
        tabIndex={0}
        className={styles.trigger}
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (isPinnedRef.current) {
            closeAndUnpin();
          } else {
            cancelScheduledClose();
            isPinnedRef.current = true;
            setIsOpen(true);
          }
        }}
        onKeyDown={(event) => {
          // Mirrors a native <button>'s Enter/Space activation - this is a
          // <span role="button">, which gets neither for free.
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.currentTarget.click();
          }
        }}
        onFocus={() => {
          cancelScheduledClose();
          setIsOpen(true);
        }}
        onBlur={() => {
          if (!isPinnedRef.current) setIsOpen(false);
        }}
      >
        <Info size={15} aria-hidden="true" />
      </span>

      {isOpen ? (
        <span
          id={panelId}
          role="note"
          className={
            align === 'left'
              ? `${styles.panel} ${styles.panelAlignLeft}`
              : styles.panel
          }
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
