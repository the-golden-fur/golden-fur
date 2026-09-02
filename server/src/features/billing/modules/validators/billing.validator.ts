import { z } from 'zod';
import {
  BANK_NAMES,
  ONLINE_PAYMENT_METHODS,
  PAYMENT_METHODS,
} from '../../billing.types.ts';

/**
 * Shared by checkout and misc-sale: bank_name is required (and only valid)
 * when payment_method = 'Bank Transfer'; payment_reference is the free-text
 * field Card/Bank Transfer/Grabmart/Pickaroo record (Issue #83 dev notes -
 * one column, interpreted differently per method in the UI). cash_tendered
 * is required only for Cash, to compute change server-side. online_channel
 * distinguishes GCash/Maya's two confirmation triggers - 'portal' (customer
 * portal, confirmed only by the PayMongo webhook, never by a cashier
 * action) vs 'walk_in_qr' (static QR shown at the counter, still requires
 * cashier confirmation like every manual method) - same channel, different
 * confirmation trigger, per Issue #83 dev notes.
 */
function validatePaymentShape(
  input: {
    payment_method?: (typeof PAYMENT_METHODS)[number];
    bank_name?: (typeof BANK_NAMES)[number];
    cash_tendered?: number;
    online_channel?: 'portal' | 'walk_in_qr';
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

  const isOnlineMethod = ONLINE_PAYMENT_METHODS.includes(
    input.payment_method as (typeof ONLINE_PAYMENT_METHODS)[number]
  );

  if (isOnlineMethod && !input.online_channel) {
    ctx.addIssue({
      code: 'custom',
      path: ['online_channel'],
      message:
        "online_channel ('portal' or 'walk_in_qr') is required for GCash/Maya",
    });
  }

  if (!isOnlineMethod && input.online_channel) {
    ctx.addIssue({
      code: 'custom',
      path: ['online_channel'],
      message: 'online_channel is only valid for GCash/Maya',
    });
  }
}

const basePaymentSchema = {
  payment_method: z.enum(PAYMENT_METHODS),
  bank_name: z.enum(BANK_NAMES).optional(),
  payment_reference: z.string().trim().min(1).optional(),
  cash_tendered: z.number().nonnegative().optional(),
  online_channel: z.enum(['portal', 'walk_in_qr']).optional(),
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
 * Exactly one of (product_catalog_id + quantity) or (description + amount) -
 * the same "hybrid dropdown/freetext" shape CatalogComboBox already uses on
 * the client (#85 dev notes: reuses the same credit-application code path,
 * so also reuses the same catalog-vs-freetext item shape).
 */
function validateMiscSaleItemShape(
  input: {
    product_catalog_id?: string;
    description?: string;
    amount?: number;
  },
  ctx: z.RefinementCtx
) {
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
}

export const createMiscSaleValidator = z
  .object({
    // transactions.customer_id is NOT NULL even for a miscellaneous sale
    // (DB Design sheet: "Denormalized - required for misc sales, which
    // have no booking_id to derive it from") - every misc sale is tied to
    // an existing customer profile, which is also what credit redemption
    // requires a customer_id to apply against.
    customer_id: z.uuid(),
    product_catalog_id: z.uuid().optional(),
    quantity: z.number().int().positive().default(1),
    description: z.string().trim().min(1).optional(),
    amount: z.number().positive().optional(),
    ...basePaymentSchema,
  })
  .strict()
  .superRefine(validatePaymentShape)
  .superRefine(validateMiscSaleItemShape);

export type CreateMiscSaleInput = z.infer<typeof createMiscSaleValidator>;

/**
 * Payment/transactions rework: the cashier's "record a payment" action on a
 * Pending booking_payment transaction (POST /billing/transactions/:id/pay).
 * bank_name / cash_tendered follow the same per-method rules validatePayment
 * Shape enforces for checkout - GCash/Maya are deliberately excluded (their
 * portal channel is webhook-confirmed, their walk-in-QR channel is settled
 * through checkout, not here).
 */
export const recordTransactionPaymentValidator = z
  .object({
    // Cashier can settle with any method: the 5 counter methods plus GCash/
    // Maya (cashier-confirmed walk-in QR - Fully Paid immediately, see
    // resolvePaymentConfirmation). 'Credit' has its own pay-with-credit path.
    payment_method: z.enum(PAYMENT_METHODS),
    bank_name: z.enum(BANK_NAMES).optional(),
    payment_reference: z.string().trim().min(1).optional(),
    cash_tendered: z.number().nonnegative().optional(),
    // Amount actually collected now (defaults to the whole transaction).
    // A smaller value settles this transaction partially and spawns a
    // Pending 'balance' transaction for the remainder.
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

    if (input.payment_method === 'Cash' && input.cash_tendered === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['cash_tendered'],
        message: "cash_tendered is required when payment_method is 'Cash'",
      });
    }
  });

export type RecordTransactionPaymentInput = z.infer<
  typeof recordTransactionPaymentValidator
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

export const updateMiscSaleValidator = z
  .object({
    product_catalog_id: z.uuid().optional(),
    quantity: z.number().int().positive().optional(),
    description: z.string().trim().min(1).optional(),
    amount: z.number().positive().optional(),
    payment_method: z.enum(PAYMENT_METHODS).optional(),
    bank_name: z.enum(BANK_NAMES).optional(),
    payment_reference: z.string().trim().min(1).optional(),
  })
  .strict();

export type UpdateMiscSaleInput = z.infer<typeof updateMiscSaleValidator>;
