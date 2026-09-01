import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../../../shared/auth/providers/AuthProvider/useAuth';
import { listCreditBalances } from '../api/credits.api';
import type { CreditBalance } from '../credits.types';
import { CreditBalanceContext } from './CreditBalanceContext';
import { CREDIT_BALANCE_CHANGED_EVENT } from './creditBalanceEvents';

/**
 * Holds the signed-in customer's own credit balances so the navbar pill and
 * the portal home read one shared fetch.
 *
 * Keeping this in sync with the server has been fragile, so it now pulls the
 * balance from every angle: an initial load, a 20s background poll, whenever
 * the tab regains focus / becomes visible, on every in-app navigation, on an
 * explicit refresh() (the cancel button etc.), and on a
 * `goldenfur:credit-balance-changed` window event any flow can dispatch. A
 * failed pull never wipes a balance that already loaded.
 *
 * Self-read only: listCreditBalances(token) with no customerId resolves to
 * the caller server-side. Mounted around the customer AppShell by
 * CustomerAuthGuard - never for staff.
 */

const POLL_INTERVAL_MS = 20_000;

export function CreditBalanceProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const { pathname } = useLocation();

  const [balances, setBalances] = useState<CreditBalance[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  // Bumped by every revalidation trigger; a dep of the fetch effect below.
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  // The one place the fetch happens - re-runs on a token change, an in-app
  // navigation (pathname), or any refresh() bump.
  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;

    void listCreditBalances(accessToken).then((result) => {
      if (!active) return;
      // Only overwrite on a good response - a transient error must not blank
      // out a balance that is already on screen.
      if (result.data) {
        setBalances(result.data);
      }
      setHasLoaded(true);
    });

    return () => {
      active = false;
    };
  }, [accessToken, pathname, reloadKey]);

  // Background poll + event-driven revalidation. Each of these just bumps
  // reloadKey (via refresh), which re-runs the fetch effect above.
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
    window.addEventListener(CREDIT_BALANCE_CHANGED_EVENT, revalidate);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener(CREDIT_BALANCE_CHANGED_EVENT, revalidate);
    };
  }, [accessToken, refresh]);

  const value = useMemo(() => {
    const rows = accessToken ? balances : [];
    return {
      balances: rows,
      total: rows.reduce((sum, b) => sum + Number(b.balance ?? 0), 0),
      isLoading: Boolean(accessToken) && !hasLoaded,
      refresh,
    };
  }, [accessToken, balances, hasLoaded, refresh]);

  return (
    <CreditBalanceContext.Provider value={value}>
      {children}
    </CreditBalanceContext.Provider>
  );
}
