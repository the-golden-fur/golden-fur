import { z } from 'zod';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

/**
 * Shared by both roles' avatar upload (AvatarPicker) - moved out of
 * staff.validator.ts once customers got the same upload flow, mirroring the
 * server's own per-feature MAX_AVATAR_SIZE_BYTES/ALLOWED_AVATAR_MIME_TYPES
 * (staff/services/avatarUpload.service.ts, customers/services/
 * avatarUpload.service.ts).
 */
export const avatarFileSchema = z
  .instanceof(File)
  .refine((file) => ALLOWED_AVATAR_MIME_TYPES.has(file.type), {
    message: 'Unsupported file type. Use PNG, JPEG, or WEBP.',
  })
  .refine((file) => file.size <= MAX_AVATAR_SIZE_BYTES, {
    message: 'File too large. Maximum size is 5MB.',
  });
