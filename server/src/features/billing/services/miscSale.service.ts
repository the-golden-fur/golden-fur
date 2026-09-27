import { supabase } from '../../../config/supabase/supabase.config.ts';
import { applyCredit, getAvailableCredit } from './creditStub.service.ts';
import { resolvePaymentConfirmation } from './paymentMethod.service.ts';
import {
  evaluateMiscSaleDiscounts,
  evaluateMiscSalePromos,
} from './discountPromoEvaluation.service.ts';
import type {
  CreateMiscSaleInput,
  MiscSaleItemInput,
  UpdateMiscSaleInput,
} from '../modules/validators/billing.validator.ts';
import type {
  DraftLineItem,
  Transaction,
  TransactionLineItem,
} from '../billing.types.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface MiscSaleResult {
  transaction: Transaction;
  lineItems: TransactionLineItem[];
  changeAmount: number | null;
}

interface ResolvedItem {
  description: string;
  referenceId: string | null;
  quantity: number;
  unitPrice: number;
}

/**
 * Same hybrid shape CatalogComboBox already uses on the client: a picked
 * product_catalog row snapshots its current price server-side (never
 * trusted from the client - same "never trust a client-supplied price"
 * pattern careInstructions.service.ts already established for
 * charged_price), or a pure freetext description + amount when nothing in
 * the catalog matches.
 */
async function resolveItem(input: MiscSaleItemInput): Promise<ResolvedItem> {
  if (input.product_catalog_id) {
    const { data: product, error } = await supabase
      .from('product_catalog')
      .select('name, price')
      .eq('id', input.product_catalog_id)
      .maybeSingle();

    if (error) throwWithStatus(400, error.message);
    if (!product) throwWithStatus(404, 'Product not found');

    return {
      description: product.name,
      referenceId: input.product_catalog_id,
      quantity: input.quantity,
      unitPrice: Number(product.price),
    };
  }

  return {
    description: input.description as string,
    referenceId: null,
    quantity: 1,
    unitPrice: input.amount as number,
  };
}

/** Session 115 (Stage C): a misc sale is now a real multi-item cart - one
 * resolveItem() call per cart line, run in parallel like
 * checkoutAggregation.service.ts's own line-item batches. */
async function resolveItems(
  items: MiscSaleItemInput[]
): Promise<ResolvedItem[]> {
  return Promise.all(items.map(resolveItem));
}

function itemsToDraftLines(items: ResolvedItem[]): DraftLineItem[] {
  return items.map((item) => ({
    line_item_type: 'misc_sale_item',
    reference_id: item.referenceId,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    line_total: round2(item.unitPrice * item.quantity),
  }));
}

/** transactions.misc_sale_description is one text column at the
 * transaction level (unchanged schema) - a multi-item sale summarizes its
 * cart into it (e.g. "Dry Kibble x2, Leash") rather than needing a schema
 * change; TransactionHistoryTable/DailySalesReportPage keep rendering it
 * as a single string, unaware anything changed. */
function summarizeDescription(items: ResolvedItem[]): string {
  return items
    .map((item) =>
      item.quantity > 1
        ? `${item.description} x${item.quantity}`
        : item.description
    )
    .join(', ');
}

export interface MiscSalePreview {
  itemLines: DraftLineItem[];
  discountLines: DraftLineItem[];
  promoLines: DraftLineItem[];
  subtotal: number;
  discountAmount: number;
  promoAmount: number;
  /** Total before credit is applied - mirrors buildCheckoutPreview's own
   * preCreditTotal, what the wizard's Discount/Promo and Payment steps show
   * as the running total. */
  preCreditTotal: number;
}

interface MiscSalePreviewParams {
  branchId: string;
  items: MiscSaleItemInput[];
  paymentMethod: string;
  seniorCitizenEligible: boolean;
  pwdEligible: boolean;
}

/**
 * Session 115 (Stage C): the read-only half of recording a misc sale -
 * aggregates the cart and evaluates discounts/promos without creating
 * anything, so the wizard's Discount/Promo step can show real line items
 * (and the Confirmation step a real total) before the cashier submits.
 * Mirrors buildCheckoutPreview's own preview/create split so no evaluation
 * logic is duplicated between this and createMiscSale below.
 */
export async function buildMiscSalePreview(
  params: MiscSalePreviewParams
): Promise<MiscSalePreview> {
  const resolvedItems = await resolveItems(params.items);
  const itemLines = itemsToDraftLines(resolvedItems);
  const subtotal = round2(
    itemLines.reduce((sum, line) => sum + line.line_total, 0)
  );

  const discountLines = await evaluateMiscSaleDiscounts({
    branchId: params.branchId,
    paymentMethod: params.paymentMethod,
    eligibility: {
      seniorCitizenEligible: params.seniorCitizenEligible,
      pwdEligible: params.pwdEligible,
    },
    subtotal,
  });
  const evaluatedPromos = await evaluateMiscSalePromos(
    params.branchId,
    subtotal
  );
  const promoLines = evaluatedPromos.map((evaluated) => evaluated.line);

  const discountAmount = round2(
    discountLines.reduce((sum, line) => sum - line.line_total, 0)
  );
  const promoAmount = round2(
    promoLines.reduce((sum, line) => sum - line.line_total, 0)
  );
  const preCreditTotal = round2(
    [...itemLines, ...discountLines, ...promoLines].reduce(
      (sum, line) => sum + line.line_total,
      0
    )
  );

  return {
    itemLines,
    discountLines,
    promoLines,
    subtotal,
    discountAmount,
    promoAmount,
    preCreditTotal,
  };
}

interface CreateMiscSaleParams {
  requesterId: string;
  branchId: string;
  input: CreateMiscSaleInput;
}

/**
 * Issue #85, extended session 115 (Stage C): a transactions row with
 * booking_id = NULL and transaction_type = 'miscellaneous_sale' (enforced
 * by the CHECK constraint from #82), now backed by a real multi-item cart
 * plus auto-evaluated discounts/promos - one transaction_line_items row
 * per cart item, discount, and promo, exactly like a booking checkout's own
 * line-item shape. Reuses the same credit-application code path as
 * checkoutAggregation.service.ts (creditStub.service.ts) rather than
 * duplicating it, matching the Guide's explicit instruction.
 */
export async function createMiscSale({
  requesterId,
  branchId,
  input,
}: CreateMiscSaleParams): Promise<MiscSaleResult> {
  const preview = await buildMiscSalePreview({
    branchId,
    items: input.items,
    paymentMethod: input.payment_method,
    seniorCitizenEligible: input.senior_citizen_eligible,
    pwdEligible: input.pwd_eligible,
  });

  const availableCredit = await getAvailableCredit(input.customer_id, branchId);
  const requestedCredit = Math.max(
    0,
    Math.min(input.credit_to_apply, availableCredit, preview.preCreditTotal)
  );
  const creditResult = await applyCredit(
    input.customer_id,
    branchId,
    requestedCredit
  );
  const creditAppliedAmount = creditResult.appliedAmount;

  const amountDue = round2(preview.preCreditTotal - creditAppliedAmount);

  const { paymentStatus, changeAmount } = resolvePaymentConfirmation({
    paymentMethod: input.payment_method,
    amountDue,
    cashTendered: input.cash_tendered,
  });

  const paymentReference = input.payment_reference ?? null;
  const resolvedItems = await resolveItems(input.items);
  const description = summarizeDescription(resolvedItems);

  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .insert({
      booking_id: null,
      customer_id: input.customer_id,
      branch_id: branchId,
      transaction_type: 'miscellaneous_sale',
      payment_method: input.payment_method,
      bank_name: input.bank_name ?? null,
      payment_status: paymentStatus,
      subtotal_amount: preview.subtotal,
      discount_amount: preview.discountAmount,
      promo_amount: preview.promoAmount,
      credit_applied_amount: creditAppliedAmount,
      total_amount: round2(preview.preCreditTotal - creditAppliedAmount),
      payment_reference: paymentReference,
      misc_sale_description: description,
      processed_by_staff_id: requesterId,
    })
    .select('*')
    .maybeSingle();

  if (transactionError || !transaction) {
    throwWithStatus(
      400,
      transactionError?.message ?? 'Failed to create miscellaneous sale'
    );
  }

  const allLines = [
    ...preview.itemLines,
    ...preview.discountLines,
    ...preview.promoLines,
  ];

  const { data: lineItems, error: lineItemsError } = await supabase
    .from('transaction_line_items')
    .insert(
      allLines.map((line) => ({ ...line, transaction_id: transaction.id }))
    )
    .select('*');

  if (lineItemsError) {
    throwWithStatus(
      400,
      lineItemsError.message ?? 'Failed to record misc sale line items'
    );
  }

  return {
    transaction: transaction as Transaction,
    lineItems: (lineItems ?? []) as TransactionLineItem[],
    changeAmount,
  };
}

export async function listMiscSales(branchId?: string): Promise<Transaction[]> {
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('transaction_type', 'miscellaneous_sale');

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data, error } = await query.order('created_at', {
    ascending: false,
  });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as Transaction[];
}

async function getMiscSaleTransaction(
  transactionId: string
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('transaction_type', 'miscellaneous_sale')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Miscellaneous sale not found');

  return data as Transaction;
}

export async function getMiscSale(
  transactionId: string
): Promise<MiscSaleResult> {
  const transaction = await getMiscSaleTransaction(transactionId);

  const { data: lineItems, error } = await supabase
    .from('transaction_line_items')
    .select('*')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  return {
    transaction,
    lineItems: (lineItems ?? []) as TransactionLineItem[],
    changeAmount: null,
  };
}

interface UpdateMiscSaleParams {
  transactionId: string;
  updates: UpdateMiscSaleInput;
}

/**
 * Admin/Superadmin only (enforced by RLS on transactions and mirrored at
 * the route layer). Session 115: narrowed to payment-fields-only (no more
 * item/amount editing) now that a sale can carry multiple
 * transaction_line_items rows - see updateMiscSaleValidator's own doc
 * comment for why.
 */
export async function updateMiscSale({
  transactionId,
  updates,
}: UpdateMiscSaleParams): Promise<MiscSaleResult> {
  await getMiscSaleTransaction(transactionId);

  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .update({
      payment_method: updates.payment_method ?? undefined,
      bank_name: updates.bank_name ?? undefined,
      payment_reference: updates.payment_reference ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transactionId)
    .select('*')
    .maybeSingle();

  if (transactionError || !transaction) {
    throwWithStatus(
      400,
      transactionError?.message ?? 'Failed to update miscellaneous sale'
    );
  }

  const { data: lineItems, error: lineItemsError } = await supabase
    .from('transaction_line_items')
    .select('*')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true });

  if (lineItemsError) throwWithStatus(400, lineItemsError.message);

  return {
    transaction: transaction as Transaction,
    lineItems: (lineItems ?? []) as TransactionLineItem[],
    changeAmount: null,
  };
}

export async function deleteMiscSale(transactionId: string): Promise<void> {
  await getMiscSaleTransaction(transactionId);

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId);

  if (error) throwWithStatus(400, error.message);
}
