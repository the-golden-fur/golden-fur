import { supabase } from '../../../config/supabase/supabase.config.ts';
import type { FaqItem, PublicFaqItem } from '../faq.types.ts';
import type {
  CreateFaqInput,
  UpdateFaqInput,
} from '../modules/validators/faq.validator.ts';

function throwWithStatus(statusCode: number, message: string): never {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  throw error;
}

/**
 * The help mascot's FAQ popup: the shown FAQs, in the order a Superadmin set.
 * Read by a logged-out visitor too (GET /public/faqs), so only the question
 * and answer leave the server.
 */
export async function listPublicFaqs(): Promise<PublicFaqItem[]> {
  const { data, error } = await supabase
    .from('faq_items')
    .select('id, question, answer')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as PublicFaqItem[];
}

/** Every FAQ, hidden ones included - for the Superadmin settings screen. */
export async function listAllFaqs(): Promise<FaqItem[]> {
  const { data, error } = await supabase
    .from('faq_items')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throwWithStatus(400, error.message);

  return (data ?? []) as FaqItem[];
}

/** A new FAQ goes to the end of the list; it is moved from there. */
export async function createFaq(input: CreateFaqInput): Promise<FaqItem> {
  const { data: last, error: lastError } = await supabase
    .from('faq_items')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) throwWithStatus(400, lastError.message);

  const { data, error } = await supabase
    .from('faq_items')
    .insert({
      question: input.question,
      answer: input.answer,
      sort_order: Number(last?.sort_order ?? 0) + 1,
    })
    .select('*')
    .maybeSingle();

  if (error || !data) {
    throwWithStatus(400, error?.message ?? 'Failed to create the FAQ');
  }

  return data as FaqItem;
}

export async function updateFaq(
  faqId: string,
  input: UpdateFaqInput
): Promise<FaqItem> {
  const { data, error } = await supabase
    .from('faq_items')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', faqId)
    .select('*')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'FAQ not found');

  return data as FaqItem;
}

/** A hard delete - the row is still captured by the universal deleted-
 * records archive (trg_archive_deleted_row), so it can be restored. */
export async function deleteFaq(faqId: string): Promise<void> {
  const { data, error } = await supabase
    .from('faq_items')
    .delete()
    .eq('id', faqId)
    .select('id')
    .maybeSingle();

  if (error) throwWithStatus(400, error.message);
  if (!data) throwWithStatus(404, 'FAQ not found');
}
