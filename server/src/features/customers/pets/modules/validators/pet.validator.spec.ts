import { describe, expect, it } from 'vitest';
import { createPetValidator, updatePetValidator } from './pet.validator.ts';

describe('createPetValidator', () => {
  it('AC-1: accepts a payload with all required fields', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
      weight_class: 'M',
      coat_type: 'SC',
    });

    expect(result.success).toBe(true);
  });

  it('accepts optional fields alongside the required ones', () => {
    const result = createPetValidator.safeParse({
      name: 'Whiskers',
      pet_type: 'Cat',
      weight_class: 'S',
      coat_type: 'LC',
      breed_id: '11111111-1111-4111-8111-111111111111',
      photo_url: 'https://example.com/photo.jpg',
      gender: 'Female',
      date_of_birth: '2022-01-15',
    });

    expect(result.success).toBe(true);
  });

  it('AC-2: rejects a payload missing a required field', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
      weight_class: 'M',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid pet_type value', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: 'Bird',
      weight_class: 'M',
      coat_type: 'SC',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized field', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
      weight_class: 'M',
      coat_type: 'SC',
      branch_id: 'branch-a',
    });

    expect(result.success).toBe(false);
  });

  it('rejects health_conditions - no longer accepted here (Issue #78)', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
      weight_class: 'M',
      coat_type: 'SC',
      health_conditions: 'Allergies',
    });

    expect(result.success).toBe(false);
  });
});

describe('updatePetValidator', () => {
  it('accepts a partial payload', () => {
    const result = updatePetValidator.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts an empty payload', () => {
    const result = updatePetValidator.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts clearing breed_id/photo_url to null', () => {
    const result = updatePetValidator.safeParse({
      breed_id: null,
      photo_url: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unrecognized field', () => {
    const result = updatePetValidator.safeParse({
      customer_id: 'someone-else',
    });
    expect(result.success).toBe(false);
  });
});
