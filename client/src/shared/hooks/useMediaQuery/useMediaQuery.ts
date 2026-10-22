import { useEffect, useState } from 'react';

/**
 * The logged-in shell's phone layout (hamburger + slide-in drawer instead of
 * the full Navbar row and the Sidebar rail). Keep in step with the
 * `@media (max-width: 768px)` rules in AppShell/Navbar/Sidebar.module.css.
 */
export const PHONE_MEDIA_QUERY = '(max-width: 768px)';

function matches(query: string): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia(query).matches;
}

/** Whether `query` currently matches, kept live as the viewport changes
 * (resizing, rotating a phone). Environments without matchMedia (jsdom,
 * SSR) report false - the desktop layout. */
export function useMediaQuery(query: string): boolean {
  const [isMatch, setIsMatch] = useState(() => matches(query));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }

    const media = window.matchMedia(query);
    const handleChange = () => setIsMatch(media.matches);

    // The query itself may have changed since the initial state was read.
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [query]);

  return isMatch;
}
