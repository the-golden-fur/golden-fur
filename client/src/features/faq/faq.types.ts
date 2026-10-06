/** One question/answer in the help mascot's FAQ popup - mirrors the
 * server's FaqItem (public.faq_items). */
export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  /** Position in the popup, lowest first. */
  sort_order: number;
  /** A hidden FAQ stays in the settings screen but is left out of the
   * popup. */
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** What GET /public/faqs returns: the shown FAQs, already in order. */
export type PublicFaqItem = Pick<FaqItem, 'id' | 'question' | 'answer'>;

export interface CreateFaqPayload {
  question: string;
  answer: string;
}

export type UpdateFaqPayload = Partial<
  Pick<FaqItem, 'question' | 'answer' | 'is_active' | 'sort_order'>
>;

/** Same limits as the server's faq.validator.ts. */
export const FAQ_QUESTION_MAX_LENGTH = 200;
export const FAQ_ANSWER_MAX_LENGTH = 2000;
