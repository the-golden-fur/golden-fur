import { z } from 'zod';
import { BANK_NAMES, PAYMENT_METHODS } from '../../billing.types.ts';

/**
 * Shared by checkout and misc-sale: bank_name is required (and only valid)
 * when payment_method = 'Bank Transfer'; payment_reference is the free-text
 * field Card/Bank Transfer/Grabmart/Pickaroo record (Issue #83 dev notes -
 * one column, interpreted differently per method in the UI). cash_tendered
 * is required only for Cash, to compute change server-side.
 */
function validatePaymentShape(
  input: {
    payment_method?: (typeof MISC_SALE_PAYMENT_METHODS)[number];
    bank_name?: (typeof BANK_NAMES)[number];
    cash_tendered?: number;
  },
  ctx: z.RefinementCtx
) {
  if (input.payment_method === undefined) return;

  if (input.payment_method === 'Bank Transfer' && !input.bank_name) {
    ctx.addIssue({
      code: 'custom',
      path: ['bank_name'],
      message: "bank_name is required when payment_method is 'Bank Transfer'",
    });
  }

  if (input.payment_method !== 'Bank Transfer' && input.bank_name) {
    ctx.addIssue({
      code: 'custom',
      path: ['bank_name'],
      message: "bank_name is only valid when payment_method is 'Bank Transfer'",
    });
  }

  if (input.payment_method === 'Cash' && input.cash_tendered === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['cash_tendered'],
      message: "cash_tendered is required when payment_method is 'Cash'",
    });
  }
}

/** A misc sale can also be paid entirely from the customer's branch credit
 * ('Credit' is a payment_method enum value - 20260901152). Checkout keeps
 * PAYMENT_METHODS: its credit only ever tops up another method. */
const MISC_SALE_PAYMENT_METHODS = [...PAYMENT_METHODS, 'Credit'] as const;

const basePaymentSchema = {
  payment_method: z.enum(PAYMENT_METHODS),
  bank_name: z.enum(BANK_NAMES).optional(),
  payment_reference: z.string().trim().min(1).optional(),
  cash_tendered: z.number().nonnegative().optional(),
  credit_to_apply: z.number().nonnegative().default(0),
};

export const checkoutValidator = z
  .object({
    booking_id: z.uuid(),
    senior_citizen_eligible: z.boolean().default(false),
    pwd_eligible: z.boolean().default(false),
    ...basePaymentSchema,
  })
  .strict()
  .superRefine(validatePaymentShape);

export type CheckoutInput = z.infer<typeof checkoutValidator>;

/**
 * Multi-booking checkout (booking_groups - 20260906173): the group
 * counterpart of checkoutValidator above, for POST
 * /billing/checkout/group/:bookingGroupId. No senior_citizen_eligible/
 * pwd_eligible fields - unlike a single booking, a group's discount/promo
 * are always locked in once at booking-group creation
 * (createBookingGroup always calls resolveDiscountAndPromo), never
 * re-evaluated at checkout time (see buildGroupCheckoutPreview's own dev
 * note in checkoutAggregation.service.ts).
 */
export const checkoutGroupValidator = z
  .object({
    booking_group_id: z.uuid(),
    ...basePaymentSchema,
  })
  .strict()
  .superRefine(validatePaymentShape);

export type GroupCheckoutInput = z.infer<typeof checkoutGroupValidator>;

/**
 * One cart line: exactly one of (product_catalog_id + quantity) or
 * (description + amount) - the same "hybrid dropdown/freetext" shape
 * CatalogComboBox already uses on the client (#85 dev notes: reuses the
 * same credit-application code path, so also reuses the same
 * catalog-vs-freetext item shape).
 */
const miscSaleItemSchema = z
  .object({
    product_catalog_id: z.uuid().optional(),
    quantity: z.number().int().positive().default(1),
    description: z.string().trim().min(1).optional(),
    amount: z.number().positive().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const hasCatalog = input.product_catalog_id !== undefined;
    const hasFreetext =
      input.description !== undefined && input.amount !== undefined;

    if (hasCatalog === hasFreetext) {
      ctx.addIssue({
        code: 'custom',
        path: ['product_catalog_id'],
        message:
          'Provide either product_catalog_id (+ optional quantity) or both description and amount, not both shapes',
      });
    }
  });

/** The discounts/promos the cashier ticked on the wizard's Discount/Promo
 * step (listed from GET /billing/misc-sale/options) - re-validated
 * server-side in evaluateMiscSaleDiscounts/evaluateMiscSalePromos. */
const miscSaleSelectionSchema = {
  discount_ids: z.array(z.uuid()).max(20).default([]),
  promo_ids: z.array(z.uuid()).max(20).default([]),
};

/**
 * Session 115 (Stage C - Cashier misc-sale wizard): a misc sale is now a
 * real multi-item cart (`items`, at least one line). Discounts/promos are
 * the ones the cashier picked (discount_ids/promo_ids) from what the admin
 * configured - see evaluateMiscSaleDiscounts (still Cash-only, per
 * paymentMethod.service.ts's rule).
 */
export const createMiscSaleValidator = z
  .object({
    // transactions.customer_id is NOT NULL even for a miscellaneous sale
    // (DB Design sheet: "Denormalized - required for misc sales, which
    // have no booking_id to derive it from") - every misc sale is tied to
    // an existing customer profile, which is also what credit redemption
    // requires a customer_id to apply against.
    customer_id: z.uuid(),
    items: z.array(miscSaleItemSchema).min(1, 'Add at least one item'),
    ...miscSaleSelectionSchema,
    ...basePaymentSchema,
    payment_method: z.enum(MISC_SALE_PAYMENT_METHODS),
  })
  .strict()
  .superRefine(validatePaymentShape);

export type CreateMiscSaleInput = z.infer<typeof createMiscSaleValidator>;
export type MiscSaleItemInput = z.infer<typeof miscSaleItemSchema>;

/**
 * Session 115: the wizard's Discount/Promo step live-previews line items as
 * the cashier ticks discounts/promos, before anything is created - needs
 * the cart + payment method (discounts are Cash-only) + the picks, nothing
 * customer/payment-reference-specific.
 */
export const previewMiscSaleValidator = z
  .object({
    items: z.array(miscSaleItemSchema).min(1, 'Add at least one item'),
    payment_method: z.enum(MISC_SALE_PAYMENT_METHODS),
    ...miscSaleSelectionSchema,
  })
  .strict();

export type PreviewMiscSaleInput = z.infer<typeof previewMiscSaleValidator>;

/** GET /billing/misc-sale/credit - whose balance the wizard's Payment step
 * checks before offering the Credit method. */
export const miscSaleCreditQueryValidator = z.object({
  customer_id: z.uuid(),
});

/**
 * Payment/transactions rework: the cashier's "record a payment" action on a
 * Pending booking_payment transaction (POST /billing/transactions/:id/pay).
 * One money field only: amount_applied (how much is being paid against the
 * transaction now) - there is no separate cash-tendered/change concept, the
 * transaction stores neither. bank_name follows the same per-method rule
 * validatePaymentShape enforces for checkout. Any PAYMENT_METHODS value is
 * accepted and settles the row immediately (a GCash/Maya value here means the
 * cashier confirmed a counter QR payment); 'Credit' has its own
 * pay-with-credit path.
 */
export const recordTransactionPaymentValidator = z
  .object({
    payment_method: z.enum(PAYMENT_METHODS),
    bank_name: z.enum(BANK_NAMES).optional(),
    payment_reference: z.string().trim().min(1).optional(),
    // Amount actually paid now (defaults to the whole transaction). A smaller
    // value settles this transaction partially and spawns a Pending 'balance'
    // transaction for the remainder.
    amount_applied: z.number().positive().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.payment_method === 'Bank Transfer' && !input.bank_name) {
      ctx.addIssue({
        code: 'custom',
        path: ['bank_name'],
        message: "bank_name is required when payment_method is 'Bank Transfer'",
      });
    }

    if (input.payment_method !== 'Bank Transfer' && input.bank_name) {
      ctx.addIssue({
        code: 'custom',
        path: ['bank_name'],
        message:
          "bank_name is only valid when payment_method is 'Bank Transfer'",
      });
    }
  });

export type RecordTransactionPaymentInput = z.infer<
  typeof recordTransactionPaymentValidator
>;

/**
 * Payment/transactions rework: optional body for POST
 * /billing/transactions/:id/pay-with-credit. amount_applied caps how much
 * credit is applied (defaults to the whole transaction); a smaller value
 * settles it partially and pay_transaction_with_credit spawns a Pending
 * 'balance' transaction for the rest. An empty body is valid (pay in full).
 */
export const payTransactionWithCreditValidator = z
  .object({
    amount_applied: z.number().positive().optional(),
  })
  .strict();

export type PayTransactionWithCreditInput = z.infer<
  typeof payTransactionWithCreditValidator
>;

/**
 * Payment/transactions rework: add a balance charge against a booking
 * (POST /billing/bookings/:id/payments) - the amount <= remaining check is
 * enforced by the add_booking_payment RPC, this only guards the shape.
 */
export const addBookingPaymentValidator = z
  .object({ amount: z.number().positive() })
  .strict();

export type AddBookingPaymentInput = z.infer<typeof addBookingPaymentValidator>;

/**
 * Session 115: narrowed to payment-fields-only now that a misc sale is a
 * multi-item cart - editing "the" description/amount stopped making sense
 * once a sale can carry more than one transaction_line_items row. Admin/
 * Superadmin can still correct how a sale was paid; correcting its
 * items/discounts after the fact isn't supported (delete and re-record it
 * instead) - flagged as a deliberate scope cut, not an oversight.
 */
export const updateMiscSaleValidator = z
  .object({
    payment_method: z.enum(PAYMENT_METHODS).optional(),
    bank_name: z.enum(BANK_NAMES).optional(),
    payment_reference: z.string().trim().min(1).optional(),
  })
  .strict();

export type UpdateMiscSaleInput = z.infer<typeof updateMiscSaleValidator>;
