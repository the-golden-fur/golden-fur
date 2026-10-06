import { describe, expect, it } from 'vitest';
import {
  linkFollowUpValidator,
  updateConsultationValidator,
} from './veterinary.validator.ts';

const CATALOG_ID = '7b0f3a0e-5a43-4a9e-9d0f-1c2b3a4d5e6f';

describe('updateConsultationValidator (pharmacy prescriptions)', () => {
  it('completes with a prescribed medicine that carries no amount - the price comes from the medicine list', () => {
    const result = updateConsultationValidator.safeParse({
      status: 'Completed',
      professional_fee: 500,
      medications: [{ name: 'Amoxicillin', dose: '50mg' }],
    });

    expect(result.success).toBe(true);
  });

  it('completes without a professional fee - the Consultation Details form no longer asks for one', () => {
    const result = updateConsultationValidator.safeParse({
      status: 'Completed',
    });

    expect(result.success).toBe(true);
  });

  it('still accepts a professional fee when one is given (the quick Complete)', () => {
    const result = updateConsultationValidator.safeParse({
      status: 'Completed',
      professional_fee: 500,
    });

    expect(result.success).toBe(true);
  });

  it('accepts a quantity, the medicine list id and where the medicine is bought', () => {
    const result = updateConsultationValidator.safeParse({
      sold_at_pharmacy: true,
      medications: [
        {
          name: 'Amoxicillin',
          dose: '50mg',
          quantity: 2,
          medication_catalog_id: CATALOG_ID,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('accepts the services done at the visit, each with its price', () => {
    const result = updateConsultationValidator.safeParse({
      status: 'Completed',
      services_done: [
        { name: 'Surgery', amount: 10000 },
        { name: 'Suture check', amount: 0 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ['a blank name', { name: '   ', amount: 100 }],
    ['a negative price', { name: 'Surgery', amount: -1 }],
    ['no price', { name: 'Surgery' }],
  ])('rejects a service done with %s', (_label, service) => {
    const result = updateConsultationValidator.safeParse({
      status: 'Completed',
      services_done: [service],
    });

    expect(result.success).toBe(false);
  });

  it.each([0, -1, 1.5])('rejects a quantity of %s', (quantity) => {
    const result = updateConsultationValidator.safeParse({
      medications: [{ name: 'Amoxicillin', dose: '50mg', quantity }],
    });

    expect(result.success).toBe(false);
  });
});

describe('linkFollowUpValidator', () => {
  it('needs the reason for the follow-up', () => {
    expect(
      linkFollowUpValidator.safeParse({ booking_id: CATALOG_ID }).success
    ).toBe(false);
    expect(
      linkFollowUpValidator.safeParse({ booking_id: CATALOG_ID, reason: '  ' })
        .success
    ).toBe(false);
    expect(
      linkFollowUpValidator.safeParse({
        booking_id: CATALOG_ID,
        reason: 'Recheck the ear',
      }).success
    ).toBe(true);
  });
});
