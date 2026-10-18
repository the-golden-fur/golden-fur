import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { TourStep } from './tourSections';
import styles from './TourOverlay.module.css';

export interface TourOverlayStep extends TourStep {
  sectionTitle: string;
  indexInSection: number;
  sectionLength: number;
}

interface TourOverlayProps {
  steps: TourOverlayStep[];
  /** Skip, Esc, or Done on the last step. */
  onClose: () => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Room left around the spotlighted element, and between it and the popover. */
const HIGHLIGHT_PADDING = 6;
const POPOVER_GAP = 14;
const POPOVER_WIDTH = 340;
/** Rough popover height, only used to decide whether it fits below. */
const POPOVER_HEIGHT_ESTIMATE = 240;
const VIEWPORT_MARGIN = 16;
/** At or below this width the popover is a bottom sheet instead. */
const NARROW_VIEWPORT = 640;

/** The target's on-screen box, or null when it isn't actually visible
 * (missing, display:none, or slid off-screen like the phone sidebar). */
function measure(target: string | undefined): Box | null {
  if (!target) return null;

  const element = document.querySelector<HTMLElement>(
    `[data-tour="${target}"]`
  );
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const isVisible =
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.top < window.innerHeight;

  return isVisible
    ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    : null;
}

function popoverPosition(box: Box): CSSProperties {
  const width = Math.min(
    POPOVER_WIDTH,
    window.innerWidth - VIEWPORT_MARGIN * 2
  );
  const centre = box.left + box.width / 2;
  const left = Math.min(
    Math.max(centre - width / 2, VIEWPORT_MARGIN),
    window.innerWidth - width - VIEWPORT_MARGIN
  );
  const below = box.top + box.height + HIGHLIGHT_PADDING + POPOVER_GAP;
  const fitsBelow =
    below + POPOVER_HEIGHT_ESTIMATE <= window.innerHeight - VIEWPORT_MARGIN;

  return fitsBelow
    ? { left, width, top: below }
    : {
        left,
        width,
        bottom: window.innerHeight - box.top + HIGHLIGHT_PADDING + POPOVER_GAP,
      };
}

/**
 * The spotlight: dims the whole screen except the step's target element (a
 * transparent box whose huge box-shadow is the dim), with a popover beside
 * it carrying the step's image, text and Skip / Previous / Next. A step
 * without a visible target gets a centred popover over a full dim instead.
 * Sits above every other layer in the app (help mascot 1400, FAQ modal
 * 1500) and swallows clicks, so the page underneath can't be used mid-tour.
 */
export function TourOverlay({ steps, onClose }: TourOverlayProps) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [isNarrow, setIsNarrow] = useState(
    () => window.innerWidth <= NARROW_VIEWPORT
  );
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  const goTo = useCallback(
    (next: number) => setIndex(Math.min(Math.max(next, 0), steps.length - 1)),
    [steps.length]
  );

  // Find the step's target, bring it into view, then measure it - and keep
  // measuring while the page resizes or scrolls under the overlay.
  useLayoutEffect(() => {
    const element = step?.target
      ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      : null;
    element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });

    const update = () => {
      setBox(measure(step?.target));
      setIsNarrow(window.innerWidth <= NARROW_VIEWPORT);
    };
    update();

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step?.target]);

  // Move focus into the popover on every step, so screen readers announce
  // the new step and the keyboard lands on its buttons.
  useEffect(() => {
    popoverRef.current?.focus();
  }, [index]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowRight') {
        setIndex((current) => Math.min(current + 1, steps.length - 1));
      } else if (event.key === 'ArrowLeft') {
        setIndex((current) => Math.max(current - 1, 0));
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, steps.length]);

  if (!step) return null;

  const placement = isNarrow ? 'sheet' : box ? 'anchored' : 'centred';

  return (
    <div className={styles.layer} data-testid="tour-overlay">
      {box ? (
        <div
          className={styles.spotlight}
          data-testid="tour-spotlight"
          style={{
            top: box.top - HIGHLIGHT_PADDING,
            left: box.left - HIGHLIGHT_PADDING,
            width: box.width + HIGHLIGHT_PADDING * 2,
            height: box.height + HIGHLIGHT_PADDING * 2,
          }}
        />
      ) : (
        <div className={styles.fullDim} />
      )}

      <div
        ref={popoverRef}
        className={styles.popover}
        data-placement={placement}
        style={
          placement === 'anchored' && box ? popoverPosition(box) : undefined
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <p className={styles.section}>
          {step.sectionTitle} · {step.indexInSection + 1} of{' '}
          {step.sectionLength}
        </p>

        {step.image ? (
          <img
            className={styles.image}
            src={step.image}
            alt={step.imageAlt ?? ''}
          />
        ) : null}

        <h2 id={titleId} className={styles.title}>
          {step.title}
        </h2>
        <p className={styles.text}>{step.text}</p>

        <div className={styles.footer}>
          <span className={styles.dots} aria-hidden="true">
            {steps.map((item, dotIndex) => (
              <span
                key={`${item.sectionTitle}-${item.title}`}
                className={styles.dot}
                data-active={dotIndex === index ? 'true' : undefined}
              />
            ))}
          </span>
          <span className={styles.visuallyHidden}>
            Step {index + 1} of {steps.length}
          </span>
        </div>

        <div className={styles.actions}>
          {isLast ? (
            <span />
          ) : (
            <button
              type="button"
              className={styles.skipButton}
              onClick={onClose}
            >
              Skip
            </button>
          )}

          <div className={styles.navButtons}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => goTo(index - 1)}
              disabled={isFirst}
            >
              Previous
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={isLast ? onClose : () => goTo(index + 1)}
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
