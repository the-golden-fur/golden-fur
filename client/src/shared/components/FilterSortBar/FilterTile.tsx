import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './FilterTile.module.css';

interface FilterTileProps {
  /** Left half of the pill text, before the colon. */
  label: string;
  /** Right half - the current value, from the field's `formatValue`. */
  displayValue: string;
  /** Accessible label for the trailing X button. */
  removeLabel: string;
  onRemove: () => void;
  /** Popover editor body. Receives a `close` it can call after a change that
   * should dismiss the popover (e.g. picking a select option). */
  children: (close: () => void) => ReactNode;
}

/**
 * One Notion-style filter/sort pill. The pill body opens a small popover to
 * change the value; a trailing X (revealed on hover, and on keyboard focus)
 * removes the tile. Body and X are sibling buttons, never nested.
 */
export function FilterTile({
  label,
  displayValue,
  removeLabel,
  onRemove,
  children,
}: FilterTileProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    <div className={styles.tile} ref={containerRef}>
      <button
        type="button"
        className={styles.body}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className={styles.label}>{label}:</span>{' '}
        <span className={styles.value}>{displayValue}</span>
      </button>

      <button
        type="button"
        className={styles.remove}
        aria-label={removeLabel}
        onClick={onRemove}
      >
        <X size={13} aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          className={styles.popover}
          role="dialog"
          aria-label={`Edit ${label} filter`}
        >
          {children(() => setIsOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
