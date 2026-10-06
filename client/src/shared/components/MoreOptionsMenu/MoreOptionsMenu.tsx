import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, MoreVertical } from 'lucide-react';
import { placeMenuVertically } from './menuPlacement';
import styles from './MoreOptionsMenu.module.css';

export interface MoreOptionsMenuItem {
  label: string;
  onSelect: () => void;
  /** Shows a checkmark next to this item - e.g. the currently active choice
   * among a small set of mutually exclusive options (a sort mode). Purely
   * decorative (aria-hidden), so it doesn't affect the item's accessible
   * name for existing callers that don't set it. */
  active?: boolean;
}

interface MoreOptionsMenuProps {
  items: MoreOptionsMenuItem[];
  /** Accessible label for the trigger button - defaults to "More options"
   * but callers embedding several of these on one page (e.g. one per row)
   * should pass something row-specific for screen reader users. */
  label?: string;
  /** Which side of the trigger the menu expands toward. Defaults to 'right'
   * (menu's right edge pins to the trigger, expanding leftward) - correct
   * for the common case of a trigger near the right edge of a wide row/card.
   * A trigger near the left edge of a narrow container (e.g. Sidebar's own
   * "Sort" button) needs 'left' instead, or the menu overflows off-screen. */
  menuAlign?: 'left' | 'right';
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
  menuAlign = 'right',
}: MoreOptionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Custom change: a row's "..." lives inside a horizontally-scrolling
  // ancestor on some pages (e.g. DataTable's own `overflow-x: auto`) -
  // per the CSS overflow spec, setting overflow-x alone still forces
  // overflow-y to compute to 'auto' too, so the menu's default
  // `position: absolute` (anchored to .container) gets silently clipped
  // for any row near that ancestor's bottom edge. Computing a `position:
  // fixed` anchor from the trigger's own screen position on open escapes
  // that clipping entirely (fixed positioning isn't affected by an
  // ancestor's overflow, only page scroll).
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => {
            const next = !prev;
            if (next) {
              const rect = triggerRef.current?.getBoundingClientRect();
              // Below the trigger normally; above it when a row near the
              // bottom of the screen would otherwise have its menu cut off
              // by the viewport edge.
              const vertical = rect
                ? placeMenuVertically({
                    anchorTop: rect.top,
                    anchorBottom: rect.bottom,
                    itemCount: items.length,
                    viewportHeight: window.innerHeight,
                    gap: 4,
                  })
                : null;
              setMenuStyle(
                rect && vertical
                  ? menuAlign === 'left'
                    ? {
                        position: 'fixed',
                        ...vertical,
                        left: rect.left,
                      }
                    : {
                        position: 'fixed',
                        ...vertical,
                        right: window.innerWidth - rect.right,
                      }
                  : null
              );
            }
            return next;
          });
        }}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          className={
            menuAlign === 'left'
              ? `${styles.menu} ${styles.menuAlignLeft}`
              : styles.menu
          }
          style={menuStyle ?? undefined}
          role="menu"
        >
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
              {item.active ? (
                <Check
                  size={14}
                  aria-hidden="true"
                  className={styles.menuItemCheck}
                />
              ) : (
                <span className={styles.menuItemCheckPlaceholder} />
              )}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
