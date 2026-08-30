import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import styles from './InfoPopover.module.css';

interface InfoPopoverProps {
  /** Accessible label for the trigger (e.g. "About walk-in bookings") -
   * every instance on a page needs its own so screen-reader users can tell
   * them apart. */
  label: string;
  /** The explanation shown when the ⓘ is clicked. */
  children: ReactNode;
  /** Which side the panel expands toward. Defaults to 'right' (panel's
   * right edge pins to the trigger) - correct for a trigger near the right
   * edge of a card. */
  align?: 'left' | 'right';
}

/**
 * A small "ⓘ" button that reveals a short explanation on click - for
 * secondary help text that would otherwise clutter a card or field label.
 * Closes on an outside click or Escape, same pattern as MoreOptionsMenu.
 * Callers embedding this inside a larger clickable element must keep the
 * trigger's click from bubbling (this component already calls
 * stopPropagation on the trigger).
 */
export function InfoPopover({
  label,
  children,
  align = 'right',
}: InfoPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <span className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
      >
        <Info size={15} aria-hidden="true" />
      </button>

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
