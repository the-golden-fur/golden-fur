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
