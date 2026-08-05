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
