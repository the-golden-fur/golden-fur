/** One question/answer in the help mascot's "Frequently asked questions"
 * popup (public.faq_items, migration 20261006246). */
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

/** What the mascot itself is given: nothing a visitor has no use for. */
export type PublicFaqItem = Pick<FaqItem, 'id' | 'question' | 'answer'>;

/** FAQs are the same for every branch and shown to every visitor, so only a
 * Superadmin edits them. */
export const FAQ_WRITE_ROLES: readonly string[] = ['Superadmin'];
