import { createContext } from 'react';
import type { SpinCreditSummary } from '../rewards.types';

export interface SpinCreditsContextValue {
  /** Unspun spins, grouped by the spin-wheel promo that granted them. */
  summary: SpinCreditSummary;
  /** Total unspun spins across every promo - what the navbar chip shows. */
  total: number;
  isLoading: boolean;
  /** Re-pull the summary - call after a spin. */
  refresh: () => void;
}

export const SpinCreditsContext = createContext<
  SpinCreditsContextValue | undefined
>(undefined);
