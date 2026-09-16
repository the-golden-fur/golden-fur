import { randomUUID } from 'node:crypto';
import { upload } from '../../../shared/services/storage/storage.service.ts';

/**
 * Custom change (Architectural-Change-History): image attachment for
 * service types/services/packages. Unlike uploadStaffAvatar
 * (staff/services/avatarUpload.service.ts), there's no existing record to
 * key the storage path or a DB update off of - the "Add new..." admin forms
 * upload the image first (this endpoint), then send the returned URL along
 * with the rest of the create payload. A random UUID prefix makes the path
 * unique without needing a record id, and (unlike avatars) an edit that
 * replaces an image doesn't clean up the old file - accepted trade-off for
 * a low-volume admin-only upload rather than adding record-aware cleanup.
 */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);
const SERVICE_IMAGES_BUCKET = 'service-images';

interface UploadServiceImageParams {
  file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
}

export async function uploadServiceImage({
  file,
}: UploadServiceImageParams): Promise<string> {
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

  return upload(SERVICE_IMAGES_BUCKET, storagePath, {
    buffer: file.buffer,
    mimetype: file.mimetype,
  });
}
