/** Plain text, not an enum - mirrors the server's credits.types.ts.
 * Documented values: issuance, redemption, expiry. */
export type CreditTransactionType = 'issuance' | 'redemption' | 'expiry';

export interface CreditBalance {
  id: string;
  customer_id: string;
  branch_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
  /** Soonest upcoming expiry across this branch's not-yet-swept issuance
   * lots (server-computed on read); null when nothing here expires. */
  next_expires_at: string | null;
  /** Pesos that actually expire on `next_expires_at` - the soonest lot(s)'
   * total capped at the current balance; null when `next_expires_at` is. */
  next_expires_amount: number | null;
}

export interface CreditTransaction {
  id: string;
  credit_balance_id: string;
  transaction_type: CreditTransactionType;
  /** Signed: positive for issuance, negative for redemption/expiry. */
  amount: number;
  cancellation_log_id: string | null;
  transaction_id: string | null;
  expires_at: string | null;
  expired_at: string | null;
  created_at: string;
}
