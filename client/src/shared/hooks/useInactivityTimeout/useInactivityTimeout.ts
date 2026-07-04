import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_WARNING_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = [
  'keydown',
  'mousedown',
  'mousemove',
  'scroll',
  'touchstart',
] as const;

interface UseInactivityTimeoutOptions {
  thresholdMs: number | null;
  onTimeout: () => void;
  warningMs?: number;
  enabled?: boolean;
}

export function useInactivityTimeout({
  thresholdMs,
  onTimeout,
  warningMs = DEFAULT_WARNING_MS,
  enabled = true,
}: UseInactivityTimeoutOptions) {
  const [isWarningVisible, setIsWarningVisible] = useState(false);
  const [remainingMs, setRemainingMs] = useState(thresholdMs ?? 0);
  const lastActivityRef = useRef(0);
  const onTimeoutRef = useRef(onTimeout);
  const hasTimedOutRef = useRef(false);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    hasTimedOutRef.current = false;
    setIsWarningVisible(false);
    setRemainingMs(thresholdMs ?? 0);
  }, [thresholdMs]);

  useEffect(() => {
    if (!enabled || !thresholdMs || thresholdMs <= 0) {
      const timeoutId = window.setTimeout(() => {
        setIsWarningVisible(false);
        setRemainingMs(0);
      }, 0);
      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    lastActivityRef.current = Date.now();
    hasTimedOutRef.current = false;

    const checkTimeout = () => {
      const elapsedMs = Date.now() - lastActivityRef.current;
      const nextRemainingMs = Math.max(thresholdMs - elapsedMs, 0);

      setRemainingMs(nextRemainingMs);
      setIsWarningVisible(nextRemainingMs <= warningMs);

      if (nextRemainingMs <= 0 && !hasTimedOutRef.current) {
        hasTimedOutRef.current = true;
        onTimeoutRef.current();
      }
    };

    const handleActivity = () => {
      resetTimer();
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });

    const intervalId = window.setInterval(checkTimeout, 1000);

    return () => {
      window.clearInterval(intervalId);
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity);
      });
    };
  }, [enabled, resetTimer, thresholdMs, warningMs]);

  return {
    isWarningVisible,
    remainingMs,
    staySignedIn: resetTimer,
  };
}
