import { useContext } from 'react';
import { CreditBalanceContext } from './CreditBalanceContext';

/**
 * The current customer's credit balance (per branch + summed total) plus a
 * refresh() to re-pull it. Only available inside the customer AppShell, which
 * wraps its subtree in <CreditBalanceProvider>.
 */
export function useCreditBalance() {
  const ctx = useContext(CreditBalanceContext);
  if (!ctx) {
    throw new Error(
      'useCreditBalance must be used within a CreditBalanceProvider'
    );
  }
  return ctx;
}
