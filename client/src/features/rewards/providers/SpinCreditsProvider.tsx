import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../../../shared/auth/providers/AuthProvider/useAuth';
import { manilaDateString } from '../../../shared/utils/promoEligibility';
import { checkIn, getMySpinCredits } from '../api/rewards.api';
import type { SpinCreditSummary } from '../rewards.types';
import { SpinCreditsContext } from './SpinCreditsContext';
import { SPIN_CREDITS_CHANGED_EVENT } from './spinCreditsEvents';

/**
 * Session 114: holds the signed-in customer's unspun spins so the navbar
 * chip, the spin pop-up, and My Rewards read one shared fetch - modelled on
 * CreditBalanceProvider.
 *
 * It also performs the daily "check-in": the first time the portal loads on
 * a given (Manila) day, it calls POST /rewards/check-in, which records the
 * visit and grants any due daily-login / weekly-streak / monthly-streak
 * spins. A visit - not the login form - is what counts, because sessions
 * persist: a returning customer who never re-types their password still
 * "logged in" that day. The server is idempotent (one login day per
 * customer per date), so the sessionStorage marker below only saves a
 * round trip; it isn't what prevents double grants.
 *
 * Revalidates on route change, window focus / visibility, a 60s poll, and
 * the SPIN_CREDITS_CHANGED_EVENT window event. A failed pull never wipes a
 * summary that already loaded. Mounted around the customer AppShell by
 * CustomerAuthGuard - never for staff.
 */

const POLL_INTERVAL_MS = 60_000;

const EMPTY_SUMMARY: SpinCreditSummary = { total: 0, byPromo: [] };

function checkInStorageKey(userId: string, day: string): string {
  return `goldenfur:spin-check-in:${userId}:${day}`;
}

function hasCheckedIn(userId: string, day: string): boolean {
  try {
    return (
      window.sessionStorage.getItem(checkInStorageKey(userId, day)) === 'true'
    );
  } catch {
    return false;
  }
}

function markCheckedIn(userId: string, day: string) {
  try {
    window.sessionStorage.setItem(checkInStorageKey(userId, day), 'true');
  } catch {
    // Best-effort only - the server is idempotent anyway.
  }
}

export function SpinCreditsProvider({ children }: { children: ReactNode }) {
  const { accessToken, user } = useAuth();
  const { pathname } = useLocation();
  const userId = user?.id ?? null;

  const [summary, setSummary] = useState<SpinCreditSummary>(EMPTY_SUMMARY);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  // The one place the fetch happens. Checks in first if this is the first
  // load of a new Manila day; otherwise just reads the current summary.
  useEffect(() => {
    if (!accessToken || !userId) {
      return;
    }

    let active = true;
    const today = manilaDateString();

    const request = hasCheckedIn(userId, today)
      ? getMySpinCredits(accessToken)
      : checkIn(accessToken).then((result) => {
          if (result.data) markCheckedIn(userId, today);
          return { data: result.data?.credits ?? null, error: result.error };
        });

    void request.then((result) => {
      if (!active) return;
      if (result.data) {
        setSummary(result.data);
      }
      setHasLoaded(true);
    });

    return () => {
      active = false;
    };
  }, [accessToken, userId, pathname, reloadKey]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const poll = window.setInterval(refresh, POLL_INTERVAL_MS);

    const revalidate = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener(SPIN_CREDITS_CHANGED_EVENT, revalidate);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener(SPIN_CREDITS_CHANGED_EVENT, revalidate);
    };
  }, [accessToken, refresh]);

  const value = useMemo(() => {
    const current = accessToken ? summary : EMPTY_SUMMARY;
    return {
      summary: current,
      total: current.total,
      isLoading: Boolean(accessToken) && !hasLoaded,
      refresh,
    };
  }, [accessToken, summary, hasLoaded, refresh]);

  return (
    <SpinCreditsContext.Provider value={value}>
      {children}
    </SpinCreditsContext.Provider>
  );
}
