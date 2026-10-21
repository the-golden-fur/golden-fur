import {
  CATEGORY_SLUGS,
  FEATURE_SLUGS,
  STORY_STEPS,
} from '../../landing.content';
import type { LandingSectionKey } from '../../landing.types';

export interface LandingEditorField {
  /** A landing_content key (migration 20261017272). */
  key: string;
  label: string;
  kind: 'text' | 'image';
  /** A textarea rather than a one-line input. */
  multiline?: boolean;
}

export interface LandingEditorSection {
  /** 'footer' is always shown, so it has no landing_sections row. */
  key: LandingSectionKey | 'footer';
  title: string;
  /** Shown under the title - where the parts not edited here come from. */
  note?: string;
  fields: LandingEditorField[];
}

const CATEGORY_LABELS: Record<string, string> = {
  grooming: 'Grooming',
  veterinary: 'Veterinary',
  daycare: 'Day Care',
  hotel: 'Pet Hotel',
};

/**
 * The editor's sections and fields, in the order they appear on the landing
 * page. Every key here is seeded by the migration; the server rejects any
 * other.
 */
export const LANDING_EDITOR_SECTIONS: LandingEditorSection[] = [
  {
    key: 'hero',
    title: 'Hero',
    note: 'The branch list under the buttons comes from Settings › Branches.',
    fields: [
      { key: 'hero.image', label: 'Background photo', kind: 'image' },
      {
        key: 'hero.image_alt',
        label: 'Photo description (read aloud by screen readers)',
        kind: 'text',
      },
      {
        key: 'hero.eyebrow',
        label: 'Small line above the headline',
        kind: 'text',
      },
      { key: 'hero.title_lead', label: 'Headline', kind: 'text' },
      {
        key: 'hero.title_brand',
        label: 'Highlighted headline words',
        kind: 'text',
      },
      {
        key: 'hero.lead',
        label: 'Intro paragraph',
        kind: 'text',
        multiline: true,
      },
      { key: 'hero.primary_cta', label: 'Main button', kind: 'text' },
      { key: 'hero.secondary_cta', label: 'Second button', kind: 'text' },
    ],
  },
  {
    key: 'services',
    title: 'What we Offer',
    note: 'Each branch tab shows a card for every service type it offers - set in Settings › Branches and Services and Packages.',
    fields: [
      { key: 'services.title', label: 'Section title', kind: 'text' },
      ...Object.values(CATEGORY_SLUGS).flatMap((slug): LandingEditorField[] => [
        {
          key: `services.${slug}.name`,
          label: `${CATEGORY_LABELS[slug]} card name`,
          kind: 'text',
        },
        {
          key: `services.${slug}.description`,
          label: `${CATEGORY_LABELS[slug]} description`,
          kind: 'text',
          multiline: true,
        },
        {
          key: `services.${slug}.image`,
          label: `${CATEGORY_LABELS[slug]} card photo`,
          kind: 'image',
        },
      ]),
    ],
  },
  {
    key: 'features',
    title: 'Service highlights',
    fields: FEATURE_SLUGS.flatMap((slug): LandingEditorField[] => [
      {
        key: `features.${slug}.title`,
        label: `${CATEGORY_LABELS[slug]} card title`,
        kind: 'text',
      },
      {
        key: `features.${slug}.summary`,
        label: `${CATEGORY_LABELS[slug]} summary`,
        kind: 'text',
        multiline: true,
      },
      {
        key: `features.${slug}.detail`,
        label: `${CATEGORY_LABELS[slug]} details (shown when opened)`,
        kind: 'text',
        multiline: true,
      },
      {
        key: `features.${slug}.image`,
        label: `${CATEGORY_LABELS[slug]} photo`,
        kind: 'image',
      },
    ]),
  },
  {
    key: 'reviews',
    title: 'Customer reviews',
    fields: [
      { key: 'reviews.title', label: 'Section title', kind: 'text' },
      { key: 'reviews.subtitle', label: 'Subtitle', kind: 'text' },
    ],
  },
  {
    key: 'story',
    title: 'Care journey',
    fields: STORY_STEPS.flatMap((step): LandingEditorField[] => [
      { key: `story.${step}.title`, label: `Step ${step} title`, kind: 'text' },
      {
        key: `story.${step}.body`,
        label: `Step ${step} text`,
        kind: 'text',
        multiline: true,
      },
      {
        key: `story.${step}.image`,
        label: `Step ${step} photo`,
        kind: 'image',
      },
    ]),
  },
  {
    key: 'visit',
    title: 'Visit us',
    note: 'Each branch’s address, hours and phone number come from Settings › Branches.',
    fields: [
      { key: 'visit.title', label: 'Section title', kind: 'text' },
      { key: 'visit.subtitle', label: 'Subtitle', kind: 'text' },
    ],
  },
  {
    key: 'cta',
    title: 'Closing call to action',
    fields: [
      { key: 'cta.title', label: 'Title', kind: 'text' },
      { key: 'cta.text', label: 'Text', kind: 'text', multiline: true },
      { key: 'cta.primary_button', label: 'Main button', kind: 'text' },
      { key: 'cta.secondary_button', label: 'Second button', kind: 'text' },
    ],
  },
  {
    key: 'footer',
    title: 'Footer',
    note: 'Always shown. The branch list comes from Settings › Branches.',
    fields: [
      {
        key: 'footer.tagline',
        label: 'Tagline',
        kind: 'text',
        multiline: true,
      },
      { key: 'footer.phone', label: 'Phone number', kind: 'text' },
      { key: 'footer.email', label: 'Email address', kind: 'text' },
    ],
  },
];
