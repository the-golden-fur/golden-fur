/**
 * The customer tutorial's content, grouped into sections. Content only -
 * edit the text, reorder steps, or add an image here without touching the
 * tour components.
 *
 * `target` is the `data-tour="..."` value of the real page element the step
 * spotlights (sidebar items are `nav:<their path>`, set in Sidebar.tsx; the
 * rest are set in Navbar.tsx, CustomerAuthGuard.tsx and AppShell.tsx). Leave
 * it out for a step that isn't about one element - it shows centred.
 *
 * To give a step an image, put the file in client/src/assets/ and import it
 * at the top of this file (same as landing.content.ts does), then set it on
 * the step:
 *
 *   import tourPets from '../../../assets/tour-pets.png';
 *   ...
 *   { title: 'Pet Manager', text: '...', image: tourPets,
 *     imageAlt: 'The Pet Manager page' },
 */
export interface TourStep {
  title: string;
  text: string;
  target?: string;
  image?: string;
  /** Describe what the image shows, for screen readers. */
  imageAlt?: string;
}

export interface TourSection {
  id: string;
  title: string;
  steps: TourStep[];
}

export const TOUR_SECTIONS: TourSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    steps: [
      {
        title: 'Welcome to Golden Fur',
        text: 'Here is a quick tour of how your account works. Use Next and Previous to move through it, or Skip to finish early.',
      },
      {
        title: 'Home',
        text: 'This takes you back to your dashboard from anywhere.',
        target: 'nav:home',
      },
      {
        title: 'Settings',
        text: 'Update your profile, theme and notification choices here. You can also replay this tutorial from Settings.',
        target: 'nav:settings',
      },
    ],
  },
  {
    id: 'pets',
    title: 'Your pets',
    steps: [
      {
        title: 'Pet Manager',
        text: 'Start here. Add each pet with its name, type and breed so you can book services for them.',
        target: 'nav:/portal/pets',
      },
      {
        title: 'Food & Medication',
        text: 'See the food and medication your pets can get from us.',
        target: 'nav:/portal/food-medication',
      },
    ],
  },
  {
    id: 'booking',
    title: 'Booking',
    steps: [
      {
        title: 'Book a Service',
        text: 'Pick a pet, a service and a time that suits you.',
        target: 'nav:/portal/book',
      },
      {
        title: 'My Bookings',
        text: 'Check, follow and manage everything you have booked.',
        target: 'nav:/portal/bookings',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments & rewards',
    steps: [
      {
        title: 'Account credit',
        text: 'Your credit balance. Credit from a cancelled booking lands here and can be used on your next visit.',
        target: 'credits',
      },
      {
        title: 'Transactions',
        text: 'Every payment you have made, with receipts.',
        target: 'nav:/portal/transactions',
      },
      {
        title: 'My Rewards',
        text: 'Rewards you have won and are ready to use.',
        target: 'nav:/portal/rewards',
      },
    ],
  },
  {
    id: 'help',
    title: 'Notifications & help',
    steps: [
      {
        title: 'Notifications',
        text: 'Booking updates show up under the bell, so you always know what is happening.',
        target: 'notifications',
      },
      {
        title: 'Messages',
        text: 'Send us a message any time.',
        target: 'messages',
      },
      {
        title: 'Your helper',
        text: 'Hover over the mascot for FAQs, contact support, or to run this tutorial again.',
        target: 'mascot',
      },
    ],
  },
];

/** The "My Rewards" step points at a nav item that's hidden while the coupon
 * spin wheel (an experimental feature) is switched off - left out then, and
 * its section is titled for what's left. */
export function tourSectionsFor(spinWheelOn: boolean): TourSection[] {
  if (spinWheelOn) return TOUR_SECTIONS;

  return TOUR_SECTIONS.map((section) =>
    section.id === 'payments'
      ? {
          ...section,
          title: 'Payments',
          steps: section.steps.filter(
            (step) => step.target !== 'nav:/portal/rewards'
          ),
        }
      : section
  );
}
