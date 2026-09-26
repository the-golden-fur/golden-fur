import { supabase } from '../../../config/supabase/supabase.config.ts';
import { PRESET_AVATAR_URLS_BY_ID } from '../../../shared/config/presetAvatars.ts';
import { ADMIN_ROLES } from '../staff.types.ts';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

interface AvatarUploadParams {
  requesterId: string;
  requesterRole: string;
  targetId: string;
  file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
}

export interface AvatarUploadResult {
  avatarUrl: string;
}

export async function uploadStaffAvatar({
  requesterId,
  requesterRole,
  targetId,
  file,
}: AvatarUploadParams): Promise<AvatarUploadResult> {
  const isSelf = requesterId === targetId;

  if (!isSelf && !ADMIN_ROLES.includes(requesterRole)) {
    const error = new Error('Forbidden');
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }

  if (!file || !file.buffer) {
    const error = new Error('No file provided');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
    const error = new Error('Unsupported file type');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    const error = new Error('File too large');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
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
    const error = new Error(uploadError?.message ?? 'Upload failed');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  const { data: existingObjects, error: listError } = await storageClient.list(
    targetId,
    {
      limit: 100,
      offset: 0,
    }
  );

  if (listError) {
    const error = new Error(listError.message);
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
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
    .from('staff_profiles')
    .update({ profile_photo_url: avatarUrl })
    .eq('id', targetId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    const errorMessage = error?.message ?? 'Profile update failed';
    const wrappedError = new Error(errorMessage);
    (wrappedError as Error & { statusCode?: number }).statusCode = 400;
    throw wrappedError;
  }

  return { avatarUrl };
}

interface AvatarPresetParams {
  requesterId: string;
  requesterRole: string;
  targetId: string;
  presetId: string;
}

/**
 * "Choose preset" needs no Storage round-trip - it resolves a client-sent
 * preset id against the server's own PRESET_AVATAR_URLS_BY_ID (never a
 * client-supplied url directly) and stores that trusted url. Same
 * self-or-Admin permission rule as uploadStaffAvatar above.
 */
export async function setStaffAvatarPreset({
  requesterId,
  requesterRole,
  targetId,
  presetId,
}: AvatarPresetParams): Promise<AvatarUploadResult> {
  const isSelf = requesterId === targetId;

  if (!isSelf && !ADMIN_ROLES.includes(requesterRole)) {
    const error = new Error('Forbidden');
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }

  const avatarUrl = PRESET_AVATAR_URLS_BY_ID[presetId];

  if (!avatarUrl) {
    const error = new Error('Unknown preset');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  const { data, error } = await supabase
    .from('staff_profiles')
    .update({ profile_photo_url: avatarUrl })
    .eq('id', targetId)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    const errorMessage = error?.message ?? 'Profile update failed';
    const wrappedError = new Error(errorMessage);
    (wrappedError as Error & { statusCode?: number }).statusCode = 400;
    throw wrappedError;
  }

  return { avatarUrl };
}
