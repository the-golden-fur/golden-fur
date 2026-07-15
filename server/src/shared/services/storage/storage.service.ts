import { supabase } from '../../../config/supabase/supabase.config.ts';
import { AppError } from '../../errors/AppError.ts';
import { ConflictError } from '../../errors/ConflictError.ts';

export interface StorageFile {
  buffer: Buffer;
  mimetype: string;
}

/**
 * Uploads `file` to `bucket` at `path` and returns its public URL.
 * Generalizes the bucket-specific logic first written inline in
 * Epic B's avatarUpload.service.ts so any Storage-backed feature can call
 * this instead of re-deriving bucket/path/URL handling from scratch.
 */
export async function upload(
  bucket: string,
  path: string,
  file: StorageFile
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '3600',
      upsert: false,
    });

  if (error || !data?.path) {
    throw new ConflictError(error?.message ?? 'Storage upload failed');
  }

  return getPublicUrl(bucket, data.path);
}

export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new AppError('Storage getPublicUrl failed', 500, false);
  }

  return data.publicUrl;
}

export async function remove(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    throw new ConflictError(error.message);
  }
}
