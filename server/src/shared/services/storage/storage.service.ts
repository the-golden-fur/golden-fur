import { supabase } from '../../../config/supabase/supabase.config.ts';
import { AppError } from '../../errors/AppError.ts';
import { ConflictError } from '../../errors/ConflictError.ts';

export interface StorageUploadFile {
  buffer: Buffer;
  contentType?: string;
}

// Bucket-agnostic wrapper around Supabase Storage, generalizing the
// bucket-specific logic Epic B wrote inline for avatarUpload.service.ts, so
// a future feature (pet photos, hotel documents, ...) can call this
// directly instead of re-deriving Storage calls.

export async function upload(
  bucket: string,
  path: string,
  file: StorageUploadFile
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file.buffer, {
      contentType: file.contentType,
      cacheControl: '3600',
      upsert: false,
    });

  if (error || !data?.path) {
    const message = error?.message ?? 'Upload failed';

    if (message.toLowerCase().includes('already exists')) {
      throw new ConflictError(message);
    }

    throw new AppError(message, 400);
  }

  return getPublicUrl(bucket, data.path);
}

export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new AppError('Failed to resolve public URL', 500);
  }

  return data.publicUrl;
}

export async function remove(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    throw new AppError(error.message, 400);
  }
}
