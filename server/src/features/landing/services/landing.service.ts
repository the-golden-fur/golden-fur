import { supabase } from '../../../config/supabase/supabase.config.ts';
import type {
  LandingAdminContent,
  LandingContentItem,
  LandingReview,
  LandingSection,
  PublicLandingContent,
  PublicLandingReview,
} from '../landing.types.ts';
import { LANDING_SECTION_KEYS } from '../landing.types.ts';
import type {
  CreateLandingReviewInput,
  UpdateLandingContentInput,
  UpdateLandingReviewInput,
} from '../modules/validators/landing.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * Everything the public landing page needs, in one request. Read by a
 * logged-out visitor (GET /public/landing), so only keys, values and the
 * shown reviews leave the server.
 */
export async function getPublicLandingContent(): Promise<PublicLandingContent> {
  const [contentResult, sectionsResult, reviewsResult] = await Promise.all([
    supabase.from('landing_content').select('key, value'),
    supabase.from('landing_sections').select('key, is_visible'),
    supabase
      .from('landing_reviews')
      .select('id, quote, name, detail, rating')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ]);

  const failed =
    contentResult.error ?? sectionsResult.error ?? reviewsResult.error;
  if (failed) throwWithStatus(400, failed.message);

  const content: Record<string, string | null> = {};
  for (const row of (contentResult.data ?? []) as Array<{
    key: string;
    value: string | null;
  }>) {
    content[row.key] = row.value;
  }

  const sections: Record<string, boolean> = {};
  for (const row of (sectionsResult.data ?? []) as Array<{
    key: string;
    is_visible: boolean;
  }>) {
    sections[row.key] = row.is_visible;
  }

  return {
    content,
    sections,
    reviews: (reviewsResult.data ?? []) as PublicLandingReview[],
  };
}

/** Every slot, section and review, hidden ones included - for the
 * Superadmin settings screen. */
export async function getLandingAdminContent(): Promise<LandingAdminContent> {
  const [contentResult, sectionsResult, reviewsResult] = await Promise.all([
    supabase.from('landing_content').select('*').order('key'),
    supabase.from('landing_sections').select('*'),
    supabase
      .from('landing_reviews')
      .select('*')
      .order('sort_order', { ascending: true }),
  ]);

  const failed =
    contentResult.error ?? sectionsResult.error ?? reviewsResult.error;
  if (failed) throwWithStatus(400, failed.message);

  return {
    content: (contentResult.data ?? []) as LandingContentItem[],
    sections: (sectionsResult.data ?? []) as LandingSection[],
    reviews: (reviewsResult.data ?? []) as LandingReview[],
  };
}

/**
 * Saves a batch of text edits in one write. Only existing text slots can be
 * set - an unknown key or an image slot (those change through the upload
 * route) rejects the whole batch, so nothing is half-saved.
 */
export async function updateLandingContent(
  input: UpdateLandingContentInput
): Promise<LandingContentItem[]> {
  // Last edit of a repeated key wins - one upsert can't touch a row twice.
  const values = new Map(input.updates.map((u) => [u.key, u.value]));
  const keys = [...values.keys()];

  const { data: existing, error: existingError } = await supabase
    .from('landing_content')
    .select('key, kind')
    .in('key', keys);

  if (existingError) throwWithStatus(400, existingError.message);

  const kinds = new Map(
    ((existing ?? []) as Array<{ key: string; kind: string }>).map((row) => [
      row.key,
      row.kind,
    ])
  );

  for (const key of keys) {
    if (!kinds.has(key)) throwWithStatus(400, `Unknown content key: ${key}`);
    if (kinds.get(key) !== 'text') {
      throwWithStatus(400, `${key} is an image - upload a file instead`);
    }
  }

  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('landing_content')
    .upsert(
      keys.map((key) => ({
        key,
        kind: 'text',
        value: values.get(key),
        updated_at: updatedAt,
      })),
      { onConflict: 'key' }
    )
    .select('*');

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as LandingContentItem[];
}

export async function updateLandingSection(
  sectionKey: string,
  isVisible: boolean
): Promise<LandingSection> {
  if (!(LANDING_SECTION_KEYS as readonly string[]).includes(sectionKey)) {
    throwWithStatus(404, 'Section not found');
  }

  const { data, error } = await supabase
    .from('landing_sections')
    .update({ is_visible: isVisible, updated_at: new Date().toISOString() })
    .eq('key', sectionKey)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Section not found');

  return data as LandingSection;
}

/** A new review goes to the end of the list; it is moved from there. */
export async function createLandingReview(
  input: CreateLandingReviewInput
): Promise<LandingReview> {
  const { data: last, error: lastError } = await supabase
    .from('landing_reviews')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) throwWithStatus(400, lastError.message);

  const { data, error } = await supabase
    .from('landing_reviews')
    .insert({
      quote: input.quote,
      name: input.name,
      detail: input.detail ?? '',
      rating: input.rating,
      sort_order: Number(last?.sort_order ?? 0) + 1,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to create the review');
  }

  return data as LandingReview;
}

export async function updateLandingReview(
  reviewId: string,
  input: UpdateLandingReviewInput
): Promise<LandingReview> {
  const { data, error } = await supabase
    .from('landing_reviews')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', reviewId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Review not found');

  return data as LandingReview;
}

/** A hard delete - the row is still captured by the universal deleted-
 * records archive (trg_archive_deleted_row), so it can be restored. */
export async function deleteLandingReview(reviewId: string): Promise<void> {
  const { data, error } = await supabase
    .from('landing_reviews')
    .delete()
    .eq('id', reviewId)
    .select('id')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'Review not found');
}
