import { createContext } from 'react';
import type { CreditBalance } from '../credits.types';

export interface CreditBalanceContextValue {
  /** One row per branch (credit is branch-locked). */
  balances: CreditBalance[];
  /** Sum across every branch - what the navbar pill shows. */
  total: number;
  isLoading: boolean;
  /** Re-fetch the caller's balances - call after an action that changes them
   * (e.g. a cancellation that converts payment to credit). */
  refresh: () => void;
}

export const CreditBalanceContext = createContext<
  CreditBalanceContextValue | undefined
>(undefined);
