import { randomUUID } from 'node:crypto';
import { supabase } from '../../../config/supabase/supabase.config.ts';

/** Private (20261030289) - read only through signed links. */
const BUCKET = 'payment-receipts';
const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024;
/** How long a "View receipt" link works. */
const SIGNED_URL_TTL_SECONDS = 10 * 60;

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface PaymentReceiptFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

interface ReceiptRow {
  id: string;
  payment_status: string;
  receipt_path: string | null;
}

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

async function loadReceiptRow(transactionId: string): Promise<ReceiptRow> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, payment_status, receipt_path')
    .eq('id', transactionId)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Transaction not found');

  return data as ReceiptRow;
}

/** Best-effort: a leftover file is harmless, so a failure is only logged. */
async function removeReceiptFiles(paths: string[]): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    console.error('Failed to remove payment receipt files:', error);
  }
}

/**
 * Custom change (payment receipts): attaches a receipt file (photo,
 * screenshot or PDF) to a transaction that has already been paid - straight
 * after "Mark as paid" on the Transactions page, or later via "Attach
 * receipt". Replacing a receipt removes the old file. The route has already
 * checked the requester is billing staff (BILLING_STAFF_ROLES).
 */
export async function attachTransactionReceipt({
  requesterId,
  transactionId,
  file,
}: {
  requesterId: string;
  transactionId: string;
  file: PaymentReceiptFile;
}): Promise<{ receipt_path: string; receipt_uploaded_at: string }> {
  const extension = EXTENSION_BY_MIME_TYPE[file.mimetype];

  if (!extension) {
    throwWithStatus(400, 'The receipt must be a PNG, JPG, WEBP or PDF file');
  }

  if (file.size > MAX_RECEIPT_SIZE_BYTES) {
    throwWithStatus(400, 'The receipt file must be 5 MB or smaller');
  }

  const transaction = await loadReceiptRow(transactionId);

  if (transaction.payment_status === 'Pending') {
    throwWithStatus(409, 'Mark the transaction as paid first');
  }

  const path = `${transactionId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

  if (uploadError) throwWithStatus(400, uploadError.message);

  const uploadedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('transactions')
    .update({
      receipt_path: path,
      receipt_uploaded_by: requesterId,
      receipt_uploaded_at: uploadedAt,
    })
    .eq('id', transactionId);

  if (updateError) {
    // Don't leave an orphaned file behind a failed save.
    await removeReceiptFiles([path]);
    throwWithStatus(400, updateError.message);
  }

  if (transaction.receipt_path) {
    await removeReceiptFiles([transaction.receipt_path]);
  }

  return { receipt_path: path, receipt_uploaded_at: uploadedAt };
}

/** A short-lived link to view a transaction's receipt. */
export async function getTransactionReceiptUrl(
  transactionId: string
): Promise<string> {
  const transaction = await loadReceiptRow(transactionId);

  if (!transaction.receipt_path) {
    throwWithStatus(404, 'This transaction has no receipt');
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(transaction.receipt_path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throwWithStatus(400, error?.message ?? 'Could not open the receipt');
  }

  return data.signedUrl;
}
