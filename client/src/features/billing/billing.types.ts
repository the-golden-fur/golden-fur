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

export const BANK_NAMES = ['BPI', 'BDO'] as const;
export type BankName = (typeof BANK_NAMES)[number];

export type TransactionType = 'booking_payment' | 'miscellaneous_sale';
export type PaymentStatus = 'Pending' | 'Fully Paid' | 'Partially Paid';

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
  /** 'downpayment' when this payment only covered the booking's down
   * payment (balance still due), 'full' otherwise. NULL for older rows /
   * misc sales. Drives the "Down payment" vs "Full payment" label in the
   * Payments Queue's per-booking payment history (§6). */
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

export interface PaymentFields {
  payment_method: PaymentMethod;
  bank_name?: BankName;
  payment_reference?: string;
  cash_tendered?: number;
  online_channel?: 'portal' | 'walk_in_qr';
  credit_to_apply?: number;
}

export interface CheckoutRequest extends PaymentFields {
  booking_id: string;
  senior_citizen_eligible?: boolean;
  pwd_eligible?: boolean;
}

export interface CheckoutResponse {
  transaction: Transaction;
  lineItems: TransactionLineItem[];
  changeAmount: number | null;
  paymongoCheckoutUrl: string | null;
}

export interface DraftLineItem {
  line_item_type: LineItemType;
  reference_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface CheckoutPreview {
  booking: {
    id: string;
    customer_id: string;
    branch_id: string;
    service_category: 'Grooming' | 'Hotel' | 'Daycare' | 'Veterinary';
  };
  serviceLines: DraftLineItem[];
  discountLines: DraftLineItem[];
  promoLines: DraftLineItem[];
  subtotal: number;
  discountAmount: number;
  promoAmount: number;
  preCreditTotal: number;
}

export interface MiscSaleRequest extends PaymentFields {
  customer_id: string;
  product_catalog_id?: string;
  quantity?: number;
  description?: string;
  amount?: number;
}

export interface MiscSaleResponse {
  transaction: Transaction;
  lineItem: TransactionLineItem;
  changeAmount: number | null;
  paymongoCheckoutUrl: string | null;
}

export interface UpdateMiscSaleRequest {
  product_catalog_id?: string;
  quantity?: number;
  description?: string;
  amount?: number;
  payment_method?: PaymentMethod;
  bank_name?: BankName;
  payment_reference?: string;
}
