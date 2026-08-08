import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import styles from './MoreOptionsMenu.module.css';

export interface MoreOptionsMenuItem {
  label: string;
  onSelect: () => void;
}

interface MoreOptionsMenuProps {
  items: MoreOptionsMenuItem[];
  /** Accessible label for the trigger button - defaults to "More options"
   * but callers embedding several of these on one page (e.g. one per row)
   * should pass something row-specific for screen reader users. */
  label?: string;
}

/**
 * Small "..." kebab menu, used on queue-picker cards for secondary actions
 * (e.g. "View booking details") that don't deserve their own always-visible
 * button. Closes on an outside click or Escape. Callers that render this
 * inside a larger clickable card must stop the trigger's click from
 * bubbling (see HotelBookingPicker's own pre-existing `.checkoutLink`
 * precedent for that same pattern) - this component only owns its own
 * open/closed state, not the surrounding card's click behavior.
 */
export function MoreOptionsMenu({
  items,
  label = 'More options',
}: MoreOptionsMenuProps) {
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
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>

      {isOpen ? (
        <div className={styles.menu} role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={(event) => {
                event.stopPropagation();
                setIsOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
