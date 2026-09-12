import { supabase } from '../../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../../shared/auth/api/supabaseAuth.api.ts';
import { CUSTOMER_MANAGER_ROLES } from '../../customer.types.ts';

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

interface PetCareItemPhotoUploadParams {
  requesterId: string;
  petId: string;
  file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
}

export interface PetCareItemPhotoUploadResult {
  photoUrl: string;
}

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Custom change (care instruction units + photos): lets a customer attach a
 * photo to a single feeding/medication item while filling out the Care
 * Instructions booking step - reuses the `pet-photos` bucket's existing RLS
 * (its policies only check the first path segment against an owned pet id,
 * so a `care-items/` subfolder is already covered - see 20260725044) rather
 * than provisioning a new bucket. Unlike uploadPetPhoto, this never updates
 * `pets.photo_url` and never removes prior uploads - many care-item photos
 * coexist per pet, one per feeding/medication row.
 */
export async function uploadPetCareItemPhoto({
  requesterId,
  petId,
  file,
}: PetCareItemPhotoUploadParams): Promise<PetCareItemPhotoUploadResult> {
  const { data: pet } = await supabase
    .from('pets')
    .select('id, customer_id')
    .eq('id', petId)
    .maybeSingle();

  if (!pet) {
    throwWithStatus(404, 'Pet not found');
  }

  const isOwner = pet.customer_id === requesterId;

  if (!isOwner) {
    const role = await getStaffRoleOrNull(requesterId);

    if (!role || !CUSTOMER_MANAGER_ROLES.includes(role)) {
      throwWithStatus(403, 'Forbidden');
    }
  }

  if (!file || !file.buffer) {
    throwWithStatus(400, 'No file provided');
  }

  if (!ALLOWED_PHOTO_MIME_TYPES.has(file.mimetype)) {
    throwWithStatus(400, 'Unsupported file type');
  }

  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    throwWithStatus(400, 'File too large');
  }

  const timestamp = Date.now();
  const safeFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${petId}/care-items/${timestamp}-${safeFileName}`;

  const storageClient = supabase.storage.from('pet-photos');
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

  const { data: publicUrlData } = supabase.storage
    .from('pet-photos')
    .getPublicUrl(uploadData.path);

  return { photoUrl: publicUrlData?.publicUrl ?? '' };
}
