import { supabase } from '../../../config/supabase/supabase.config.ts';
import { PRESET_AVATAR_URLS_BY_ID } from '../../../shared/config/presetAvatars.ts';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

interface AvatarUploadParams {
  requesterId: string;
  targetId: string;
  file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
}

interface AvatarPresetParams {
  requesterId: string;
  targetId: string;
  presetId: string;
}

export interface AvatarUploadResult {
  avatarUrl: string;
}

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Mirrors staff/services/avatarUpload.service.ts's uploadStaffAvatar - same
 * 'avatars' Storage bucket, same targetId/-prefixed path, same
 * upload-then-clean-up-previous-objects shape - but self-only, since
 * there's no "staff member uploads on a customer's behalf" case for this
 * feature the way an Admin can for another staff member's avatar.
 */
export async function uploadCustomerAvatar({
  requesterId,
  targetId,
  file,
}: AvatarUploadParams): Promise<AvatarUploadResult> {
  if (requesterId !== targetId) {
    throwWithStatus(403, 'Forbidden');
  }

  if (!file || !file.buffer) {
    throwWithStatus(400, 'No file provided');
  }

  if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
    throwWithStatus(400, 'Unsupported file type');
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    throwWithStatus(400, 'File too large');
  }

  const timestamp = Date.now();
  const safeFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${targetId}/${timestamp}-${safeFileName}`;

  const storageClient = supabase.storage.from('avatars');
  const { data: uploadData, error: uploadError } = await storageClient.upload(
    storagePath,
    file.buffer,
    {
      contentType: file.mimetype,
      cacheControl: '3600',
      upsert: false,
    }
  );

  if (uploadError || !uploadData?.path) {
    throwWithStatus(400, uploadError?.message ?? 'Upload failed');
  }

  const { data: existingObjects, error: listError } = await storageClient.list(
    targetId,
    { limit: 100, offset: 0 }
  );

  if (listError) {
    throwWithStatus(400, listError.message);
  }

  const previousObjects = (existingObjects ?? []).filter(
    (item) => item.name && item.name !== uploadData.path.split('/').pop()
  );

  if (previousObjects.length > 0) {
    await storageClient.remove(
      previousObjects.map((item) => `${targetId}/${item.name}`)
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(uploadData.path);

  const avatarUrl = publicUrlData?.publicUrl ?? '';

  const { data, error } = await supabase
    .from('customer_profiles')
    .update({ profile_photo_url: avatarUrl })
    .eq('id', targetId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Profile update failed');
  }

  return { avatarUrl };
}

/**
 * "Choose preset" needs no Storage round-trip - it resolves a client-sent
 * preset id against the server's own PRESET_AVATAR_URLS_BY_ID (never a
 * client-supplied url directly) and stores that trusted url.
 */
export async function setCustomerAvatarPreset({
  requesterId,
  targetId,
  presetId,
}: AvatarPresetParams): Promise<AvatarUploadResult> {
  if (requesterId !== targetId) {
    throwWithStatus(403, 'Forbidden');
  }

  const avatarUrl = PRESET_AVATAR_URLS_BY_ID[presetId];

  if (!avatarUrl) {
    throwWithStatus(400, 'Unknown preset');
  }

  const { data, error } = await supabase
    .from('customer_profiles')
    .update({ profile_photo_url: avatarUrl })
    .eq('id', targetId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Profile update failed');
  }

  return { avatarUrl };
}
