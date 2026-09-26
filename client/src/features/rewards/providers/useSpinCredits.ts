import { useContext } from 'react';
import { SpinCreditsContext } from './SpinCreditsContext';

/**
 * The signed-in customer's unspun spins (per promo + total) plus a
 * refresh(). Only available inside the customer AppShell, which wraps its
 * subtree in <SpinCreditsProvider>.
 */
export function useSpinCredits() {
  const ctx = useContext(SpinCreditsContext);
  if (!ctx) {
    throw new Error('useSpinCredits must be used within a SpinCreditsProvider');
  }
  return ctx;
}
