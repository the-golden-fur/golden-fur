/**
 * Feature-local role lists (mirrors hotel.types.ts / discounts.types.ts).
 * Money-handling roles mirror BOOKING_MARK_PAID_ROLES in booking.types.ts -
 * the same roles already trusted to mark a booking Paid can create a
 * transaction here. Admin/Superadmin additionally get update/delete on
 * miscellaneous-sale entries (per explicit request - cashiers can create a
 * misc sale but not correct or remove one after the fact).
 */
export const BILLING_STAFF_ROLES: readonly string[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Cashier',
];

export const BILLING_ADMIN_ROLES: readonly string[] = ['Admin', 'Superadmin'];

export type TransactionType = 'booking_payment' | 'miscellaneous_sale';

export const PAYMENT_METHODS = [
  'Cash',
  'GCash',
  'Maya',
  'Card',
  'Bank Transfer',
  'Grabmart',
  'Pickaroo',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ONLINE_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'GCash',
  'Maya',
];

/**
 * Payment/transactions rework (§ record-a-payment): the counter methods a
 * cashier can settle a Pending booking_payment transaction with in one
 * step - every manual method except GCash/Maya's portal channel (which
 * only the PayMongo webhook confirms). 'Credit' is settled through the
 * dedicated pay-with-credit path (transactionPayment.service.ts), not here.
 */
export const COUNTER_PAYMENT_METHODS = [
  'Cash',
  'Card',
  'Bank Transfer',
  'Grabmart',
  'Pickaroo',
] as const;
export type CounterPaymentMethod = (typeof COUNTER_PAYMENT_METHODS)[number];

export const BANK_NAMES = ['BPI', 'BDO'] as const;
export type BankName = (typeof BANK_NAMES)[number];

export type PaymentStatus = 'Pending' | 'Fully Paid' | 'Partially Paid';

/** Plain text, not an enum - matches the migration's own convention
 * (transaction_line_items.line_item_type). Documented values: service,
 * addon, discount, promo, reschedule_fee, misc_sale_item. */
export type LineItemType =
  | 'service'
  | 'addon'
  | 'discount'
  | 'promo'
  | 'reschedule_fee'
  | 'misc_sale_item';

export interface Transaction {
  id: string;
  booking_id: string | null;
  customer_id: string;
  branch_id: string;
  transaction_type: TransactionType;
  payment_method: PaymentMethod;
  bank_name: BankName | null;
  payment_status: PaymentStatus;
  subtotal_amount: number;
  discount_amount: number;
  promo_amount: number;
  credit_applied_amount: number;
  total_amount: number;
  payment_reference: string | null;
  misc_sale_description: string | null;
  webhook_confirmed_at: string | null;
  processed_by_staff_id: string | null;
  /** 'staff' for every pre-existing/cashier-created row (default);
   * 'customer' only for a booking payment the customer initiated themselves
   * (customerBookingPayment.service.ts) - lets confirmPaymongoWebhookEvent
   * additionally advance the booking's payment_stage once one of these
   * confirms, without touching cashier-checkout behavior. */
  initiated_by: 'staff' | 'customer';
  /** Only set on a customer-initiated booking_payment row - which
   * advancePaymentStage target the webhook should apply once this
   * confirms. */
  payment_choice: 'full' | 'downpayment' | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionLineItem {
  id: string;
  transaction_id: string;
  line_item_type: LineItemType;
  reference_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
}

/** A line item shape not yet persisted - what every line-item source
 * function (grooming/hotel/daycare/veterinary, discount/promo evaluation,
 * misc sale) produces before checkoutAggregation.service.ts totals and
 * inserts them together. */
export interface DraftLineItem {
  line_item_type: LineItemType;
  reference_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface TransactionWithLineItems {
  transaction: Transaction;
  lineItems: TransactionLineItem[];
}
