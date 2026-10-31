export const RECEIPT_ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
];
const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024;

/** Same rules as the server (paymentReceipt.service.ts) - checked here
 * first so staff see the problem before anything is sent. */
export function receiptFileError(file: File): string | null {
  if (!RECEIPT_ACCEPTED_TYPES.includes(file.type)) {
    return 'The receipt must be a PNG, JPG, WEBP or PDF file.';
  }
  if (file.size > MAX_RECEIPT_SIZE_BYTES) {
    return 'The receipt file must be 5 MB or smaller.';
  }
  return null;
}
