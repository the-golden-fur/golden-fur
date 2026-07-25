import { supabase } from '../../../../config/supabase/supabase.config.ts';
import { getStaffRoleOrNull } from '../../../../shared/auth/api/supabaseAuth.api.ts';
import { CUSTOMER_MANAGER_ROLES } from '../../customer.types.ts';

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

interface PetPhotoUploadParams {
  requesterId: string;
  petId: string;
  file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
}

export interface PetPhotoUploadResult {
  photoUrl: string;
}

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Issue #77: optional pet photo, mirroring avatarUpload.service.ts's
 * upload/list/replace-in-place pattern for the `pet-photos` bucket (see the
 * #74/#77 support migration for its RLS). Owner customer or
 * CUSTOMER_MANAGER_ROLES staff may upload - same authorization shape as
 * createPetController/updatePetController.
 */
export async function uploadPetPhoto({
  requesterId,
  petId,
  file,
}: PetPhotoUploadParams): Promise<PetPhotoUploadResult> {
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
  const storagePath = `${petId}/${timestamp}-${safeFileName}`;

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

  const { data: existingObjects, error: listError } = await storageClient.list(
    petId,
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
      previousObjects.map((item) => `${petId}/${item.name}`)
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from('pet-photos')
    .getPublicUrl(uploadData.path);

  const photoUrl = publicUrlData?.publicUrl ?? '';

  const { data, error } = await supabase
    .from('pets')
    .update({ photo_url: photoUrl })
    .eq('id', petId)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Pet update failed');
  }

  return { photoUrl };
}
