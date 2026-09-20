import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type TouchEvent,
} from 'react';
import { Check } from 'lucide-react';
import type { MoreOptionsMenuItem } from './MoreOptionsMenu';
import styles from './MoreOptionsMenu.module.css';

interface CardContextMenuProps {
  items: MoreOptionsMenuItem[];
  /** Accessible label for the menu itself (there's no visible trigger button
   * to label here) - pass something card-specific, e.g. "Actions for
   * Jamie Cruz". */
  label: string;
  /** The card/content this menu attaches to. Rendered as-is - this
   * component only adds the right-click/long-press listeners and the
   * popover, it never changes how the child itself looks. */
  children: ReactNode;
}

const LONG_PRESS_MS = 500;
/** How far a touch may drift and still count as a long-press, not a scroll
 * or a drag. */
const MOVE_TOLERANCE_PX = 10;

/**
 * Board/Gallery card variant of MoreOptionsMenu - a persistent "..." kebab
 * button on every card in a dense grid/board reads as visual noise (see
 * session feedback on Staff/Customer Management's Board and Gallery views),
 * so there's no visible trigger here at all. Right-click (desktop) opens
 * the identical menu instead; touch devices have no right-click, so a
 * long-press (hold without dragging) does the same job - a plain tap is
 * left alone so it still reaches whatever's actually inside the card (e.g.
 * a "Resend account email" button).
 */
export function CardContextMenu({ items, label, children }: CardContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );

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

  function handleContextMenu(event: ReactMouseEvent) {
    event.preventDefault();
    setIsOpen(true);
  }

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }

  function handleTouchEnd(event: TouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const heldMs = Date.now() - start.time;
    const movedPx = Math.hypot(touch.clientX - start.x, touch.clientY - start.y);

    if (heldMs >= LONG_PRESS_MS && movedPx < MOVE_TOLERANCE_PX) {
      event.preventDefault();
      setIsOpen(true);
    }
  }

  return (
    <div
      className={styles.contextWrapper}
      ref={containerRef}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        touchStartRef.current = null;
      }}
    >
      {children}

      {isOpen ? (
        <div className={styles.menu} role="menu" aria-label={label}>
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
