import { describe, expect, it } from 'vitest';
import { createPetValidator, updatePetValidator } from './pet.validator.ts';

describe('createPetValidator', () => {
  it('AC-1: accepts a payload with all required fields', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      species: 'Dog',
      weight_class: 'M',
      coat_type: 'SC',
    });

    expect(result.success).toBe(true);
  });

  it('accepts optional fields alongside the required ones', () => {
    const result = createPetValidator.safeParse({
      name: 'Whiskers',
      species: 'Cat',
      weight_class: 'S',
      coat_type: 'LC',
      breed: 'Persian',
      gender: 'Female',
      date_of_birth: '2022-01-15',
      health_conditions: 'None',
    });

    expect(result.success).toBe(true);
  });

  it('AC-2: rejects a payload missing a required field', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      species: 'Dog',
      weight_class: 'M',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid species value', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      species: 'Bird',
      weight_class: 'M',
      coat_type: 'SC',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized field', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      species: 'Dog',
      weight_class: 'M',
      coat_type: 'SC',
      branch_id: 'branch-a',
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

  it('rejects an unrecognized field', () => {
    const result = updatePetValidator.safeParse({
      customer_id: 'someone-else',
    });
    expect(result.success).toBe(false);
  });
});
