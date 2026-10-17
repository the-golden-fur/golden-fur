import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANDING_BRANCHES,
  DEFAULT_LANDING_IMAGES,
  DEFAULT_LANDING_REVIEWS,
  DEFAULT_LANDING_TEXT,
  formatOperatingHours,
  resolveLanding,
} from './landing.content';

describe('resolveLanding', () => {
  it('falls back to every built-in default when nothing could be loaded', () => {
    const landing = resolveLanding(null, null);

    expect(landing.text['hero.title_lead']).toBe(
      DEFAULT_LANDING_TEXT['hero.title_lead']
    );
    expect(landing.text['hero.image']).toBe(DEFAULT_LANDING_IMAGES['hero.image']);
    expect(Object.values(landing.sections).every(Boolean)).toBe(true);
    expect(landing.reviews).toBe(DEFAULT_LANDING_REVIEWS);
    expect(landing.branches).toBe(DEFAULT_LANDING_BRANCHES);
  });

  it('lays saved values over the defaults, keeping the default for a null image', () => {
    const landing = resolveLanding(
      {
        content: {
          'hero.title_lead': 'Love as deep as',
          'hero.image': null,
          'story.1.image': 'https://cdn.example/step.png',
          'unknown.key': 'ignored',
        },
        sections: { reviews: false },
        reviews: [],
      },
      []
    );

    expect(landing.text['hero.title_lead']).toBe('Love as deep as');
    expect(landing.text['hero.image']).toBe(DEFAULT_LANDING_IMAGES['hero.image']);
    expect(landing.text['story.1.image']).toBe('https://cdn.example/step.png');
    expect(landing.text).not.toHaveProperty('unknown.key');
    expect(landing.sections.reviews).toBe(false);
    expect(landing.sections.hero).toBe(true);
    // A loaded empty list is real - no reviews, no branches - not "use defaults".
    expect(landing.reviews).toEqual([]);
    expect(landing.branches).toEqual([]);
  });
});

describe('formatOperatingHours', () => {
  it('groups consecutive days with the same hours and marks missing days Closed', () => {
    expect(
      formatOperatingHours({
        monday: { open: '08:00', close: '18:00' },
        tuesday: { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' },
        thursday: { open: '08:00', close: '18:00' },
        friday: { open: '08:00', close: '18:00' },
        saturday: { open: '09:00', close: '12:30' },
      })
    ).toEqual([
      { days: 'Mon – Fri', time: '8:00 AM – 6:00 PM' },
      { days: 'Sat', time: '9:00 AM – 12:30 PM' },
      { days: 'Sun', time: 'Closed' },
    ]);
  });

  it('reads a branch with no hours set as closed all week', () => {
    expect(formatOperatingHours({})).toEqual([
      { days: 'Mon – Sun', time: 'Closed' },
    ]);
  });
});
