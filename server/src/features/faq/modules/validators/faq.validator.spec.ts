import { describe, expect, it } from 'vitest';
import { createFaqValidator, updateFaqValidator } from './faq.validator.ts';

describe('createFaqValidator', () => {
  it('accepts a question and an answer, trimmed', () => {
    const parsed = createFaqValidator.safeParse({
      question: '  Q?  ',
      answer: '  A.  ',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ question: 'Q?', answer: 'A.' });
  });

  it('rejects a blank question or answer', () => {
    expect(
      createFaqValidator.safeParse({ question: '   ', answer: 'A.' }).success
    ).toBe(false);
    expect(
      createFaqValidator.safeParse({ question: 'Q?', answer: '' }).success
    ).toBe(false);
  });

  it('rejects text too long for the mascot popup', () => {
    expect(
      createFaqValidator.safeParse({
        question: 'Q'.repeat(201),
        answer: 'A.',
      }).success
    ).toBe(false);
    expect(
      createFaqValidator.safeParse({
        question: 'Q?',
        answer: 'A'.repeat(2001),
      }).success
    ).toBe(false);
  });

  it('rejects fields it does not know', () => {
    expect(
      createFaqValidator.safeParse({ question: 'Q?', answer: 'A.', id: 'x' })
        .success
    ).toBe(false);
  });
});

describe('updateFaqValidator', () => {
  it('accepts any one field on its own', () => {
    expect(updateFaqValidator.safeParse({ question: 'Q?' }).success).toBe(true);
    expect(updateFaqValidator.safeParse({ is_active: false }).success).toBe(
      true
    );
    expect(updateFaqValidator.safeParse({ sort_order: 3 }).success).toBe(true);
  });

  it('rejects an empty update', () => {
    expect(updateFaqValidator.safeParse({}).success).toBe(false);
  });

  it('rejects a position that is not a whole number of 1 or more', () => {
    expect(updateFaqValidator.safeParse({ sort_order: 0 }).success).toBe(false);
    expect(updateFaqValidator.safeParse({ sort_order: 1.5 }).success).toBe(
      false
    );
  });
});
