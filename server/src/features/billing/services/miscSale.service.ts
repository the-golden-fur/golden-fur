import { supabase } from '../../../config/supabase/supabase.config.ts';
import { applyCredit, getAvailableCredit } from './creditStub.service.ts';
import { resolvePaymentConfirmation } from './paymentMethod.service.ts';
import { initiatePaymongoPayment } from './paymongo.service.ts';
import type {
  CreateMiscSaleInput,
  UpdateMiscSaleInput,
} from '../modules/validators/billing.validator.ts';
import type { Transaction, TransactionLineItem } from '../billing.types.ts';

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
  lineItem: TransactionLineItem;
  changeAmount: number | null;
  paymongoCheckoutUrl: string | null;
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
async function resolveItem(
  input: Pick<
    CreateMiscSaleInput,
    'product_catalog_id' | 'quantity' | 'description' | 'amount'
  >
): Promise<ResolvedItem> {
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

interface CreateMiscSaleParams {
  requesterId: string;
  branchId: string;
  input: CreateMiscSaleInput;
}

/**
 * Issue #85: a transactions row with booking_id = NULL and
 * transaction_type = 'miscellaneous_sale' (enforced by the CHECK
 * constraint from #82) plus a single misc_sale_item line item. Reuses the
 * same credit-application code path as checkoutAggregation.service.ts
 * (creditStub.service.ts) rather than duplicating it, matching the Guide's
 * explicit instruction.
 */
export async function createMiscSale({
  requesterId,
  branchId,
  input,
}: CreateMiscSaleParams): Promise<MiscSaleResult> {
  const item = await resolveItem(input);
  const subtotal = round2(item.unitPrice * item.quantity);

  const availableCredit = await getAvailableCredit(input.customer_id, branchId);
  const requestedCredit = Math.max(
    0,
    Math.min(input.credit_to_apply, availableCredit, subtotal)
  );
  const creditResult = await applyCredit(
    input.customer_id,
    branchId,
    requestedCredit
  );
  const creditAppliedAmount = creditResult.appliedAmount;

  const amountDue = round2(subtotal - creditAppliedAmount);

  const { paymentStatus, changeAmount } = resolvePaymentConfirmation({
    paymentMethod: input.payment_method,
    onlineChannel: input.online_channel,
    amountDue,
    cashTendered: input.cash_tendered,
  });

  let paymentReference = input.payment_reference ?? null;
  let paymongoCheckoutUrl: string | null = null;

  if (paymentStatus === 'Pending') {
    const initiated = await initiatePaymongoPayment({
      paymentMethod: input.payment_method as 'GCash' | 'Maya',
      amount: amountDue,
      description: item.description,
      redirectSuccessUrl: process.env.PAYMONGO_REDIRECT_SUCCESS_URL ?? '',
      redirectFailedUrl: process.env.PAYMONGO_REDIRECT_FAILED_URL ?? '',
    });
    paymentReference = initiated.sourceId;
    paymongoCheckoutUrl = initiated.checkoutUrl;
  }

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
      subtotal_amount: subtotal,
      discount_amount: 0,
      promo_amount: 0,
      credit_applied_amount: creditAppliedAmount,
      total_amount: round2(subtotal - creditAppliedAmount),
      payment_reference: paymentReference,
      misc_sale_description: item.description,
      processed_by_staff_id: paymentStatus === 'Pending' ? null : requesterId,
    })
    .select('*')
    .maybeSingle();

  if (transactionError || !transaction) {
    throwWithStatus(
      400,
      transactionError?.message ?? 'Failed to create miscellaneous sale'
    );
  }

  const { data: lineItem, error: lineItemError } = await supabase
    .from('transaction_line_items')
    .insert({
      transaction_id: transaction.id,
      line_item_type: 'misc_sale_item',
      reference_id: item.referenceId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: subtotal,
    })
    .select('*')
    .maybeSingle();

  if (lineItemError || !lineItem) {
    throwWithStatus(
      400,
      lineItemError?.message ?? 'Failed to record misc sale line item'
    );
  }

  return {
    transaction: transaction as Transaction,
    lineItem: lineItem as TransactionLineItem,
    changeAmount,
    paymongoCheckoutUrl,
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

  const { data: lineItem, error } = await supabase
    .from('transaction_line_items')
    .select('*')
    .eq('transaction_id', transactionId)
    .eq('line_item_type', 'misc_sale_item')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!lineItem) throwWithStatus(404, 'Miscellaneous sale line item not found');

  return {
    transaction,
    lineItem: lineItem as TransactionLineItem,
    changeAmount: null,
    paymongoCheckoutUrl: null,
  };
}

interface UpdateMiscSaleParams {
  transactionId: string;
  updates: UpdateMiscSaleInput;
}

/**
 * Admin/Superadmin only (enforced by RLS on transactions/
 * transaction_line_items and mirrored at the route layer) - recomputes
 * line_total/total_amount server-side whenever the item shape changes,
 * never trusting a client-supplied total (same rule createMiscSale
 * follows).
 */
export async function updateMiscSale({
  transactionId,
  updates,
}: UpdateMiscSaleParams): Promise<MiscSaleResult> {
  const existing = await getMiscSale(transactionId);

  const itemChanged =
    updates.product_catalog_id !== undefined ||
    updates.quantity !== undefined ||
    updates.description !== undefined ||
    updates.amount !== undefined;

  let description = existing.transaction.misc_sale_description as string;
  let referenceId = existing.lineItem.reference_id;
  let quantity = existing.lineItem.quantity;
  let unitPrice = existing.lineItem.unit_price;

  if (itemChanged) {
    const resolved = await resolveItem({
      product_catalog_id: updates.product_catalog_id,
      quantity: updates.quantity ?? existing.lineItem.quantity,
      description: updates.description,
      amount: updates.amount,
    });
    description = resolved.description;
    referenceId = resolved.referenceId;
    quantity = resolved.quantity;
    unitPrice = resolved.unitPrice;
  }

  const lineTotal = round2(unitPrice * quantity);
  const totalAmount = round2(
    lineTotal - existing.transaction.credit_applied_amount
  );

  const { data: lineItem, error: lineItemError } = await supabase
    .from('transaction_line_items')
    .update({
      reference_id: referenceId,
      description,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
    })
    .eq('id', existing.lineItem.id)
    .select('*')
    .maybeSingle();

  if (lineItemError || !lineItem) {
    throwWithStatus(
      400,
      lineItemError?.message ?? 'Failed to update misc sale line item'
    );
  }

  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .update({
      subtotal_amount: lineTotal,
      total_amount: totalAmount,
      misc_sale_description: description,
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

  return {
    transaction: transaction as Transaction,
    lineItem: lineItem as TransactionLineItem,
    changeAmount: null,
    paymongoCheckoutUrl: null,
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
