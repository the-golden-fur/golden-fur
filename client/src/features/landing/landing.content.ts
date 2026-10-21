import heroBg from '../../assets/goldenfurbg.jpg';
import grooming from '../../assets/grooming.png';
import vet from '../../assets/vet.png';
import hotel from '../../assets/hotel.png';
import daycare from '../../assets/daycare.png';
import step1 from '../../assets/step1.png';
import step2 from '../../assets/step2.png';
import step3 from '../../assets/step3.png';
import step4 from '../../assets/step4.png';
import type {
  LandingSectionKey,
  PublicBranch,
  PublicLandingContent,
  PublicLandingReview,
  ServiceCategory,
} from './landing.types';

/**
 * The landing page's built-in content - exactly what the migration
 * (20261017272) seeds, word for word. Used when GET /public/landing can't be
 * reached, so the page always renders in full; once it can, whatever a
 * Superadmin has saved replaces it key by key.
 */
export const DEFAULT_LANDING_TEXT: Record<string, string> = {
  'hero.eyebrow': 'Grooming · Veterinary · Day Care · Pet Hotel',
  'hero.title_lead': 'Care as warm as',
  'hero.title_brand': 'Golden Fur',
  'hero.lead':
    'Compassionate, expert care for your beloved companions — because every tail wag, purr, and nuzzle deserves the very best.',
  'hero.primary_cta': 'Book an appointment',
  'hero.secondary_cta': 'Explore our services',
  'hero.image_alt':
    'The Golden Fur shop sign on a white brick wall beside shelves of pet care products',

  'services.title': 'What we Offer',
  'services.grooming.name': 'Grooming',
  'services.grooming.description':
    'Gentle bathing, coat trimming, nail clipping, ear cleaning, and styling to keep your pet clean, healthy, and comfortable.',
  'services.veterinary.name': 'Veterinary',
  'services.veterinary.description':
    'Comprehensive checkups, diagnostics, vaccinations, treatment plans, and expert medical care tailored to your pet’s needs.',
  'services.daycare.name': 'Day Care',
  'services.daycare.description':
    'Safe, supervised daytime care with social play, feeding support, and rest time for pets while you’re away.',
  'services.hotel.name': 'Pet Hotel',
  'services.hotel.description':
    'Comfortable overnight boarding with attentive staff, clean suites, routine care, and regular wellness monitoring.',

  'features.grooming.title': 'Premium Grooming',
  'features.grooming.summary':
    'Gentle coat care, trim styling, and wellness-focused grooming sessions.',
  'features.grooming.detail':
    'Includes breed-specific coat treatments, de-shedding options, nail and paw care, and a calming bath routine handled by certified groomers.',
  'features.veterinary.title': 'Veterinary Consults',
  'features.veterinary.summary':
    'Routine checkups and preventive care for healthier, happier pets.',
  'features.veterinary.detail':
    'Vaccinations, deworming, diagnostics, and personalized treatment plans from licensed veterinarians who track your pet’s health over time.',
  'features.daycare.title': 'Trusted Day Care',
  'features.daycare.summary':
    'Safe supervised play and rest while you’re away for the day.',
  'features.daycare.detail':
    'Group play matched to temperament and size, scheduled rest breaks, and feeding on your pet’s usual routine, all under attentive staff supervision.',
  'features.hotel.title': 'Comfort Pet Hotel',
  'features.hotel.summary':
    'Clean cozy overnight boarding with attentive and loving support.',
  'features.hotel.detail':
    'Private suites, regular wellness checks, comfortable bedding, and daily updates so you can travel with peace of mind.',

  'reviews.title': 'Loved by pet parents',
  'reviews.subtitle':
    'Real words from families across our Makati and Southwoods branches.',

  'story.1.title': 'Warm, attentive intake',
  'story.1.body':
    'We begin with a calm assessment so your pet feels safe while we understand history, behavior, and immediate needs.',
  'story.2.title': 'Customized care mapping',
  'story.2.body':
    'Our team maps a tailored service path—from grooming to veterinary support—based on breed, age, and condition.',
  'story.3.title': 'Precise, gentle execution',
  'story.3.body':
    'Every treatment is delivered with careful handling, clear updates, and quality checks at each milestone.',
  'story.4.title': 'Ongoing wellness continuity',
  'story.4.body':
    'After the visit, we guide next steps and preventive routines to keep your companion healthy between appointments.',

  'visit.title': 'Visit us',
  'visit.subtitle':
    'Drop by either branch — walk-ins are welcome, appointments recommended.',

  'cta.title': 'Your pet’s next visit starts here',
  'cta.text':
    'Book online in minutes for grooming, veterinary, day care, and boarding — at our Makati and Southwoods branches.',
  'cta.primary_button': 'Book an appointment',
  'cta.secondary_button': 'Find a branch',

  'footer.tagline':
    'Compassionate, expert pet care across grooming, veterinary, day care, and boarding — because every pet deserves the best.',
  'footer.phone': '+63 2 0000 0000',
  'footer.email': 'hello@goldenfur.ph',
};

/** The bundled image behind each image slot - shown while a slot has no
 * uploaded image (its value is null). */
export const DEFAULT_LANDING_IMAGES: Record<string, string> = {
  'hero.image': heroBg,
  'services.grooming.image': grooming,
  'services.veterinary.image': vet,
  'services.daycare.image': daycare,
  'services.hotel.image': hotel,
  'features.grooming.image': grooming,
  'features.veterinary.image': vet,
  'features.daycare.image': daycare,
  'features.hotel.image': hotel,
  'story.1.image': step1,
  'story.2.image': step2,
  'story.3.image': step3,
  'story.4.image': step4,
};

export const DEFAULT_LANDING_REVIEWS: PublicLandingReview[] = [
  {
    id: 'default-1',
    quote:
      'Rio used to come home from other groomers anxious and shaking. Here he practically drags me to the door. The team clearly loves what they do.',
    name: 'Andrea Salcedo',
    detail: 'Grooming · Makati',
    rating: 5,
  },
  {
    id: 'default-2',
    quote:
      'Our senior cat needed bloodwork and a dental. The vet walked us through every option without rushing, and we even got a follow-up call the next day.',
    name: 'Miguel Tan',
    detail: 'Veterinary · Makati',
    rating: 5,
  },
  {
    id: 'default-3',
    quote:
      'Booked the pet hotel for a week-long trip. The daily photo updates meant I actually relaxed on vacation — Buddy came back happy and calm.',
    name: 'Kristine Reyes',
    detail: 'Pet Hotel · Southwoods',
    rating: 5,
  },
  {
    id: 'default-4',
    quote:
      'Day care has been a lifesaver on long workdays. Nala gets her play and naps on schedule, and pickup is always quick and friendly.',
    name: 'Paolo Mendoza',
    detail: 'Day Care · Makati',
    rating: 5,
  },
  {
    id: 'default-5',
    quote:
      'Switched both dogs here after one visit. Clean, always on time, and they remember the little things — like which one is terrified of the dryer.',
    name: 'Camille Ong',
    detail: 'Grooming · Southwoods',
    rating: 5,
  },
];

const WEEKDAY_HOURS = { open: '09:00', close: '19:00' };
const WEEKEND_HOURS = { open: '08:00', close: '18:00' };
const DEFAULT_HOURS = {
  monday: WEEKDAY_HOURS,
  tuesday: WEEKDAY_HOURS,
  wednesday: WEEKDAY_HOURS,
  thursday: WEEKDAY_HOURS,
  friday: WEEKDAY_HOURS,
  saturday: WEEKEND_HOURS,
  sunday: WEEKEND_HOURS,
};

/** What the landing page showed before branches came from the database -
 * only used when GET /public/branches can't be reached. */
export const DEFAULT_LANDING_BRANCHES: PublicBranch[] = [
  {
    id: 'default-makati',
    name: 'Makati',
    address: 'Golden Fur Pet Care, Makati, Metro Manila, Philippines',
    contact_number: '+63 2 8000 0000',
    operating_hours: DEFAULT_HOURS,
    categories: ['Grooming', 'Veterinary', 'Daycare', 'Hotel'],
  },
  {
    id: 'default-southwoods',
    name: 'Southwoods',
    address: 'Golden Fur Pet Care, Southwoods, Laguna, Philippines',
    contact_number: '+63 49 500 0000',
    operating_hours: DEFAULT_HOURS,
    categories: ['Grooming', 'Daycare', 'Hotel'],
  },
];

/** A service category's slug in content keys, e.g. `services.daycare.name`. */
export const CATEGORY_SLUGS: Record<ServiceCategory, string> = {
  Grooming: 'grooming',
  Veterinary: 'veterinary',
  Daycare: 'daycare',
  Hotel: 'hotel',
};

/** The four highlight cards and four care-journey steps, in page order. */
export const FEATURE_SLUGS = ['grooming', 'veterinary', 'daycare', 'hotel'];
export const STORY_STEPS = ['1', '2', '3', '4'];

export interface ResolvedLanding {
  /** Every text and image slot, filled in - an image slot is a URL to show. */
  text: Record<string, string>;
  sections: Record<LandingSectionKey, boolean>;
  reviews: PublicLandingReview[];
  branches: PublicBranch[];
}

const SECTION_KEYS: LandingSectionKey[] = [
  'hero',
  'services',
  'features',
  'reviews',
  'story',
  'visit',
  'cta',
];

/**
 * Lays what the server returned over the built-in defaults. `null` for
 * either half means it couldn't be loaded - that half falls back to the
 * defaults entirely. A missing or empty text value, or an image slot still
 * null, keeps its default; a section with no row stays shown.
 */
export function resolveLanding(
  fetched: PublicLandingContent | null,
  branches: PublicBranch[] | null
): ResolvedLanding {
  const text: Record<string, string> = {
    ...DEFAULT_LANDING_TEXT,
    ...DEFAULT_LANDING_IMAGES,
  };

  for (const [key, value] of Object.entries(fetched?.content ?? {})) {
    if (key in text && typeof value === 'string' && value.trim() !== '') {
      text[key] = value;
    }
  }

  const sections = Object.fromEntries(
    SECTION_KEYS.map((key) => [key, fetched?.sections[key] ?? true])
  ) as Record<LandingSectionKey, boolean>;

  return {
    text,
    sections,
    reviews: fetched ? fetched.reviews : DEFAULT_LANDING_REVIEWS,
    branches: branches ?? DEFAULT_LANDING_BRANCHES,
  };
}

const DAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const DAY_LABELS: Record<(typeof DAY_ORDER)[number], string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

/** "13:30" -> "1:30 PM". */
function formatTime(value: string): string {
  const [hourText, minute = '00'] = value.split(':');
  const hour = Number(hourText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${suffix}`;
}

/**
 * A branch's weekly hours as the "Visit us" rows: consecutive days with the
 * same hours share one row ("Mon – Fri", "9:00 AM – 7:00 PM"), and a day
 * missing from the map reads "Closed".
 */
export function formatOperatingHours(
  hours: PublicBranch['operating_hours']
): Array<{ days: string; time: string }> {
  const rows: Array<{ first: string; last: string; time: string }> = [];

  for (const day of DAY_ORDER) {
    const entry = hours[day];
    const time = entry
      ? `${formatTime(entry.open)} – ${formatTime(entry.close)}`
      : 'Closed';
    const previous = rows[rows.length - 1];

    if (previous && previous.time === time) {
      previous.last = DAY_LABELS[day];
    } else {
      rows.push({ first: DAY_LABELS[day], last: DAY_LABELS[day], time });
    }
  }

  return rows.map((row) => ({
    days: row.first === row.last ? row.first : `${row.first} – ${row.last}`,
    time: row.time,
  }));
}
