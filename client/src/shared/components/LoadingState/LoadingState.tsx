import { useState } from 'react';
import styles from './LoadingState.module.css';

/** Served from `client/public/loading/` by URL (not an `import`), so the app
 * still builds - and this component still renders its label - even if the
 * file goes missing. A GIF rather than a video: every browser plays it with
 * a transparent background, with none of the codec gaps a .mov/.mp4 has
 * (HEVC doesn't play in Firefox or on many Windows machines). */
const LOADER_GIF_SRC = '/loading/loader.gif';

interface LoadingStateProps {
  /** Announced to screen readers, and shown as text only when the icon
   * isn't - say what's loading ("Loading bookings...") where the page
   * knows. */
  label?: string;
  /** 'page' (default): large and centered, for a whole page or panel that
   * has nothing else to show yet. 'inline': small, for one section loading
   * inside an otherwise-rendered page. */
  size?: 'page' | 'inline';
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * The site-wide "waiting on the database" indicator - replaces the plain
 * `<p>Loading...</p>` every page used to render. Shows the branded loader
 * GIF on its own, with the label kept for screen readers only. A GIF can't
 * be paused, so with reduced motion requested the icon is left out and the
 * label shows as text instead; same if the file fails to load.
 */
export function LoadingState({
  label = 'Loading...',
  size = 'page',
}: LoadingStateProps) {
  const [hasIcon, setHasIcon] = useState(() => !prefersReducedMotion());

  return (
    <div
      className={size === 'inline' ? styles.inline : styles.page}
      role="status"
      aria-live="polite"
    >
      {hasIcon ? (
        <img
          className={styles.icon}
          src={LOADER_GIF_SRC}
          alt=""
          aria-hidden="true"
          data-testid="loading-icon"
          onError={() => setHasIcon(false)}
        />
      ) : null}
      <span className={hasIcon ? styles.srOnlyLabel : styles.label}>
        {label}
      </span>
    </div>
  );
}
