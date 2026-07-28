import { useEffect, useState } from 'react';

/**
 * `Date.now()` is an impure read - calling it directly during render trips
 * the react-hooks/purity rule (render must be idempotent: the same props/
 * state must produce the same output). The initial value is read via
 * useState's lazy initializer (runs once, on mount, not on every re-render -
 * accepted by the purity rule the same way `useState(() => [])` is), and
 * every value after that comes from the interval callback below - a
 * subscription-style effect (React's own recommended shape: "subscribe for
 * updates from some external system, calling setState in a callback"), not
 * a synchronous setState in the effect body, which react-hooks/set-state-
 * in-effect flags separately.
 */
export function useNowMs(refreshIntervalMs = 60_000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), refreshIntervalMs);
    return () => clearInterval(interval);
  }, [refreshIntervalMs]);

  return nowMs;
}
