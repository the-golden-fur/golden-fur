import { randomUUID } from 'node:crypto';
import { supabase } from '../../../../config/supabase/supabase.config.ts';

/** Private (20261021277) - read only through signed links. */
const BUCKET = 'vaccination-proofs';
const MAX_PROOF_SIZE_BYTES = 5 * 1024 * 1024;
/** How long a "View card" link works. */
const SIGNED_URL_TTL_SECONDS = 10 * 60;

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface VaccinationProofFile {
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

/**
 * Stores a vaccination card photo (or PDF) and returns its path. The
 * caller has already authorized the requester; this only validates and
 * uploads. Unlike uploadPetPhoto there is no replace-in-place - each record
 * keeps its own card.
 */
export async function uploadVaccinationProof(
  petId: string,
  file: VaccinationProofFile
): Promise<string> {
  const extension = EXTENSION_BY_MIME_TYPE[file.mimetype];

  if (!extension) {
    throwWithStatus(400, 'The card must be a PNG, JPG, WEBP or PDF file');
  }

  if (file.size > MAX_PROOF_SIZE_BYTES) {
    throwWithStatus(400, 'The card file must be 5 MB or smaller');
  }

  const path = `${petId}/${randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });

  if (error) throwWithStatus(400, error.message);

  return path;
}

/** Best-effort: a leftover file is harmless, so a failure is only logged. */
export async function removeVaccinationProofs(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    console.error('Failed to remove vaccination card files:', error);
  }
}

/** Adds a short-lived `proof_url` to every record that has a card. */
export async function withSignedProofUrls<
  T extends { proof_path: string | null },
>(records: T[]): Promise<Array<T & { proof_url: string | null }>> {
  const paths = records
    .map((record) => record.proof_path)
    .filter((path): path is string => Boolean(path));

  const urlByPath = new Map<string, string>();

  if (paths.length > 0) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

    if (error) {
      // The records are still worth showing without their links.
      console.error('Failed to sign vaccination card links:', error);
    }

    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) {
        urlByPath.set(entry.path, entry.signedUrl);
      }
    }
  }

  return records.map((record) => ({
    ...record,
    proof_url: record.proof_path
      ? (urlByPath.get(record.proof_path) ?? null)
      : null,
  }));
}
