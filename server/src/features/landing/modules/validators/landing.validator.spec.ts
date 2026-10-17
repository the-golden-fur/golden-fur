import { describe, expect, it } from 'vitest';
import {
  createLandingReviewValidator,
  updateLandingContentValidator,
  updateLandingReviewValidator,
} from './landing.validator.ts';

describe('updateLandingContentValidator', () => {
  it('accepts a batch of text edits, trimmed', () => {
    const parsed = updateLandingContentValidator.safeParse({
      updates: [{ key: 'hero.title_lead', value: '  Hello  ' }],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      updates: [{ key: 'hero.title_lead', value: 'Hello' }],
    });
  });

  it('rejects blank or over-long text', () => {
    expect(
      updateLandingContentValidator.safeParse({
        updates: [{ key: 'hero.lead', value: '  ' }],
      }).success
    ).toBe(false);
    expect(
      updateLandingContentValidator.safeParse({
        updates: [{ key: 'hero.lead', value: 'x'.repeat(2001) }],
      }).success
    ).toBe(false);
  });

  it('rejects a key that could not be a content key', () => {
    for (const key of ['', 'Hero.Lead', '../hero', 'hero lead']) {
      expect(
        updateLandingContentValidator.safeParse({
          updates: [{ key, value: 'x' }],
        }).success
      ).toBe(false);
    }
  });

  it('rejects an empty batch', () => {
    expect(
      updateLandingContentValidator.safeParse({ updates: [] }).success
    ).toBe(false);
  });
});

describe('landing review validators', () => {
  it('accepts a review without a detail line', () => {
    expect(
      createLandingReviewValidator.safeParse({
        quote: 'Great.',
        name: 'Ana',
        rating: 5,
      }).success
    ).toBe(true);
  });

  it('rejects a rating outside 1-5', () => {
    for (const rating of [0, 6, 4.5]) {
      expect(
        createLandingReviewValidator.safeParse({
          quote: 'Great.',
          name: 'Ana',
          rating,
        }).success
      ).toBe(false);
    }
  });

  it('rejects an update with nothing in it', () => {
    expect(updateLandingReviewValidator.safeParse({}).success).toBe(false);
  });
});
