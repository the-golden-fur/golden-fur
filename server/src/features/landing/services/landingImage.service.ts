import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { LandingContentItem } from '../landing.types.ts';

const BUCKET = 'landing-images';
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export interface LandingImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/** The slot must exist and be an image slot - the key also becomes the
 * Storage folder, so it is never used before this check passes. */
async function assertImageSlot(key: string): Promise<void> {
  const { data, error } = await supabase
    .from('landing_content')
    .select('kind')
    .eq('key', key)
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Image slot not found');
  if (data.kind !== 'image') throwWithStatus(400, `${key} is not an image`);
}

/** Every file stored for a slot, except `keepName` - a slot only ever needs
 * its current file. */
async function removeStoredFiles(key: string, keepName?: string) {
  const storageClient = supabase.storage.from(BUCKET);
  const { data: existing, error } = await storageClient.list(key, {
    limit: 100,
    offset: 0,
  });

  if (error) throwWithStatus(400, error.message);

  const stale = (existing ?? []).filter(
    (item) => item.name && item.name !== keepName
  );

  if (stale.length > 0) {
    await storageClient.remove(stale.map((item) => `${key}/${item.name}`));
  }
}

async function setSlotValue(
  key: string,
  value: string | null
): Promise<LandingContentItem> {
  const { data, error } = await supabase
    .from('landing_content')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Image slot not found');

  return data as LandingContentItem;
}

/**
 * Replaces one landing-page image. Same checks and storage layout as the
 * staff avatar upload (avatarUpload.service.ts): png/jpeg/webp up to 5 MB,
 * stored under `<key>/<timestamp>-<name>`, older files for the slot removed.
 */
export async function uploadLandingImage(
  key: string,
  file: LandingImageFile | undefined
): Promise<LandingContentItem> {
  if (!file || !file.buffer) throwWithStatus(400, 'No file provided');
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    throwWithStatus(400, 'Unsupported file type');
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) throwWithStatus(400, 'File too large');

  await assertImageSlot(key);

  const safeFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${key}/${Date.now()}-${safeFileName}`;

  const storageClient = supabase.storage.from(BUCKET);
  const { data: uploadData, error: uploadError } = await storageClient.upload(
    storagePath,
    file.buffer,
    { contentType: file.mimetype, cacheControl: '3600', upsert: false }
  );

  if (uploadError || !uploadData?.path) {
    throwWithStatus(400, uploadError?.message ?? 'Upload failed');
  }

  await removeStoredFiles(key, uploadData.path.split('/').pop());

  const { data: publicUrlData } = storageClient.getPublicUrl(uploadData.path);

  return setSlotValue(key, publicUrlData?.publicUrl ?? null);
}

/** Back to the image bundled with the app: clears the slot and deletes its
 * stored files. */
export async function resetLandingImage(
  key: string
): Promise<LandingContentItem> {
  await assertImageSlot(key);
  await removeStoredFiles(key);

  return setSlotValue(key, null);
}
