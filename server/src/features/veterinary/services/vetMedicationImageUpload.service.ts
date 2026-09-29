import { randomUUID } from 'node:crypto';
import { upload } from '../../../shared/services/storage/storage.service.ts';

/**
 * Custom change: image attachment for My Catalog > Medications, same
 * pattern as maintenance/services/maintenanceImageUpload.service.ts's
 * uploadServiceImage - there's no existing record to key the storage path
 * or a DB update off of (the "Add medication" form uploads the image first,
 * then sends the returned URL along with the rest of the create payload). A
 * random UUID prefix makes the path unique without needing a record id, and
 * (matching that same precedent) an edit that replaces an image doesn't
 * clean up the old file - accepted trade-off for a low-volume per-vet
 * upload rather than adding record-aware cleanup.
 */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);
const VET_MEDICATION_IMAGES_BUCKET = 'vet-medication-images';

interface UploadMedicationImageParams {
  file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
}

export async function uploadMedicationImage({
  file,
}: UploadMedicationImageParams): Promise<string> {
  if (!file || !file.buffer) {
    const error = new Error('No file provided');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    const error = new Error('Unsupported file type');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const error = new Error('File too large');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  const safeFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${randomUUID()}-${safeFileName}`;

  return upload(VET_MEDICATION_IMAGES_BUCKET, storagePath, {
    buffer: file.buffer,
    mimetype: file.mimetype,
  });
}
