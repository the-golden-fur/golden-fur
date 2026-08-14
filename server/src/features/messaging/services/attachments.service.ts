import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { MessageAttachment } from '../messaging.types.ts';

const MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

export interface UploadedAttachment {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

interface UploadAttachmentParams {
  uploaderId: string;
  file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
}

/**
 * Uploads a single file to the 'message-attachments' bucket and returns a
 * plain descriptor - deliberately does NOT insert a message_attachments row
 * (there's no message yet at upload time; the compose/reply flow uploads
 * files first, then sends the descriptors along with the send request,
 * which inserts the rows once the message row exists - see
 * insertAttachmentsForMessage below).
 */
export async function uploadAttachment({
  uploaderId,
  file,
}: UploadAttachmentParams): Promise<UploadedAttachment> {
  if (!file?.buffer) {
    throwWithStatus(400, 'No file provided');
  }

  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
    throwWithStatus(400, 'Unsupported file type');
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throwWithStatus(400, 'File too large');
  }

  const timestamp = Date.now();
  const safeFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${uploaderId}/${timestamp}-${safeFileName}`;

  const storageClient = supabase.storage.from('message-attachments');
  const { data: uploadData, error: uploadError } = await storageClient.upload(
    storagePath,
    file.buffer,
    { contentType: file.mimetype, cacheControl: '3600', upsert: false }
  );

  if (uploadError || !uploadData?.path) {
    throwWithStatus(400, uploadError?.message ?? 'Upload failed');
  }

  const { data: publicUrlData } = storageClient.getPublicUrl(uploadData.path);

  return {
    fileName: file.originalname,
    fileUrl: publicUrlData?.publicUrl ?? '',
    fileSize: file.size,
    mimeType: file.mimetype,
  };
}

export async function insertAttachmentsForMessage(
  messageId: string,
  attachments: UploadedAttachment[]
): Promise<MessageAttachment[]> {
  if (attachments.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('message_attachments')
    .insert(
      attachments.map((attachment) => ({
        message_id: messageId,
        file_name: attachment.fileName,
        file_url: attachment.fileUrl,
        file_size: attachment.fileSize,
        mime_type: attachment.mimeType,
      }))
    )
    .select('*');

  if (error) {
    throwWithStatus(400, error.message);
  }

  return (data ?? []) as MessageAttachment[];
}
