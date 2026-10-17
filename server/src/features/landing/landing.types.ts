import type { OperatingHours } from '../branches/branches.types.ts';

/** One editable slot on the landing page (public.landing_content, migration
 * 20261017272). The set of keys is fixed by that migration. */
export interface LandingContentItem {
  key: string;
  /** 'image' slots hold a 'landing-images' Storage public URL, or null for
   * "use the image bundled with the app". */
  kind: 'text' | 'image';
  value: string | null;
  updated_at: string;
}

export const LANDING_SECTION_KEYS = [
  'hero',
  'services',
  'features',
  'reviews',
  'story',
  'visit',
  'cta',
] as const;

export type LandingSectionKey = (typeof LANDING_SECTION_KEYS)[number];

export interface LandingSection {
  key: LandingSectionKey;
  is_visible: boolean;
  updated_at: string;
}

/** One "Loved by pet parents" review (public.landing_reviews). */
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

/** What GET /public/landing returns - only what a visitor's page needs. */
export interface PublicLandingContent {
  content: Record<string, string | null>;
  sections: Record<string, boolean>;
  reviews: PublicLandingReview[];
}

/** What the Superadmin settings screen loads (GET /maintenance/landing). */
export interface LandingAdminContent {
  content: LandingContentItem[];
  sections: LandingSection[];
  reviews: LandingReview[];
}

export type ServiceCategory = 'Grooming' | 'Hotel' | 'Daycare' | 'Veterinary';

/** A branch as the public landing page shows it (GET /public/branches). */
export interface PublicBranch {
  id: string;
  name: string;
  address: string;
  contact_number: string | null;
  operating_hours: OperatingHours;
  /** Service categories with at least one active, available service here -
   * the same rows booking checks - in a fixed display order. */
  categories: ServiceCategory[];
}

/** The landing page is the same for every visitor at every branch, so only
 * a Superadmin edits it - same as FAQ_WRITE_ROLES. */
export const LANDING_WRITE_ROLES: readonly string[] = ['Superadmin'];
