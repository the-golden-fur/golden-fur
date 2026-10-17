/** Mirrors the server's landing.types.ts (public.landing_content /
 * landing_sections / landing_reviews, migration 20261017272). */

export type LandingSectionKey =
  | 'hero'
  | 'services'
  | 'features'
  | 'reviews'
  | 'story'
  | 'visit'
  | 'cta';

export interface LandingContentItem {
  key: string;
  /** 'image' slots hold a Storage public URL, or null for the image bundled
   * with the app. */
  kind: 'text' | 'image';
  value: string | null;
  updated_at: string;
}

export interface LandingSection {
  key: LandingSectionKey;
  is_visible: boolean;
  updated_at: string;
}

export interface LandingReview {
  id: string;
  quote: string;
  name: string;
  /** e.g. "Grooming · Makati". May be empty. */
  detail: string;
  rating: number;
  /** Position on the page, lowest first. */
  sort_order: number;
  /** A hidden review stays in the settings screen but is left off the page. */
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type PublicLandingReview = Pick<
  LandingReview,
  'id' | 'quote' | 'name' | 'detail' | 'rating'
>;

/** What GET /public/landing returns. */
export interface PublicLandingContent {
  content: Record<string, string | null>;
  sections: Record<string, boolean>;
  reviews: PublicLandingReview[];
}

/** What GET /maintenance/landing returns (Superadmin settings screen). */
export interface LandingAdminContent {
  content: LandingContentItem[];
  sections: LandingSection[];
  reviews: LandingReview[];
}

export type ServiceCategory = 'Grooming' | 'Hotel' | 'Daycare' | 'Veterinary';

export interface OperatingHoursEntry {
  /** "HH:MM", branch-local. */
  open: string;
  close: string;
}

/** A day absent from the map means the branch is closed that day. */
export type OperatingHours = Partial<
  Record<
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
    | 'sunday',
    OperatingHoursEntry
  >
>;

/** What GET /public/branches returns for each branch. */
export interface PublicBranch {
  id: string;
  name: string;
  address: string;
  contact_number: string | null;
  operating_hours: OperatingHours;
  /** Categories the branch offers, in card order. */
  categories: ServiceCategory[];
}

export interface CreateLandingReviewPayload {
  quote: string;
  name: string;
  detail?: string;
  rating: number;
}

export type UpdateLandingReviewPayload = Partial<
  Pick<
    LandingReview,
    'quote' | 'name' | 'detail' | 'rating' | 'is_active' | 'sort_order'
  >
>;

/** Same limits as the server's landing.validator.ts. */
export const LANDING_TEXT_MAX_LENGTH = 2000;
export const LANDING_REVIEW_QUOTE_MAX_LENGTH = 600;
export const LANDING_REVIEW_NAME_MAX_LENGTH = 80;
export const LANDING_REVIEW_DETAIL_MAX_LENGTH = 80;
