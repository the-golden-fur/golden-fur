/**
 * Feature-local role list (mirrors billing.types.ts's BILLING_STAFF_ROLES).
 * Deliberately narrower than every money-handling role - AC-3 (#95) says
 * exactly "cashier/Admin/Superadmin can see any customer's" balance/history,
 * not the wider Supervisor/Receptionist set billing.types.ts's own read
 * roles include.
 */
export const CREDIT_STAFF_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
  'Cashier',
];

export const CREDIT_ADMIN_ROLES: readonly string[] = ['Admin', 'Superadmin'];

/** Plain text, not an enum - matches cancellation_logs.event_type's
 * convention. Documented values: issuance, redemption, expiry. */
export type CreditTransactionType = 'issuance' | 'redemption' | 'expiry';

export interface CreditBalance {
  id: string;
  customer_id: string;
  branch_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
  /** Soonest upcoming expiry across this branch balance's not-yet-swept
   * issuance lots - null when nothing here expires. Computed on read, not
   * stored. */
  next_expires_at: string | null;
  /** Pesos that actually expire on `next_expires_at`: the soonest-dated
   * lot(s)' nominal total, capped at the current balance (redemptions since
   * issuance shrink what can still expire - same rule as expire_credits()).
   * null when `next_expires_at` is null. */
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
