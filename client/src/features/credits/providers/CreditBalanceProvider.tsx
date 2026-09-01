import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../../../shared/auth/providers/AuthProvider/useAuth';
import { listCreditBalances } from '../api/credits.api';
import type { CreditBalance } from '../credits.types';
import { CreditBalanceContext } from './CreditBalanceContext';

/**
 * Issue: navbar credit indicator (#customer). Holds the signed-in customer's
 * own credit balances so both the navbar pill and the portal home read one
 * fetch, and an action that changes the balance (a cancellation that
 * converts payment to credit - CustomerBookingsPage) can refresh it
 * immediately via refresh().
 *
 * Self-read only: listCreditBalances(accessToken) with no customerId
 * resolves to the caller server-side. Wrapped around the customer AppShell
 * subtree by CustomerAuthGuard - never mounted for staff.
 */
export function CreditBalanceProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const [balances, setBalances] = useState<CreditBalance[]>([]);
  // Only tracks the FIRST load - a refresh() re-fetch keeps showing the old
  // total until the new one lands rather than flashing the pill away.
  const [hasLoaded, setHasLoaded] = useState(false);
  // Bumped by refresh() to re-run the effect below.
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let isMounted = true;

    void listCreditBalances(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }
      setHasLoaded(true);
      if (result.data) {
        setBalances(result.data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, reloadKey]);

  const value = useMemo(
    () => ({
      balances,
      total: balances.reduce((sum, balance) => sum + balance.balance, 0),
      isLoading: !hasLoaded,
      refresh,
    }),
    [balances, hasLoaded, refresh]
  );

  return (
    <CreditBalanceContext.Provider value={value}>
      {children}
    </CreditBalanceContext.Provider>
  );
}
