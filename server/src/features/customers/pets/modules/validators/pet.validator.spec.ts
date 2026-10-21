import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPetValidator,
  createPetValidatorStaff,
  updatePetValidator,
  updatePetValidatorStaff,
} from './pet.validator.ts';

describe('createPetValidator (customer-facing)', () => {
  it('AC-1: accepts a payload with all required fields', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
      gender: 'Male',
    });

    expect(result.success).toBe(true);
  });

  it('accepts optional fields alongside the required ones', () => {
    const result = createPetValidator.safeParse({
      name: 'Whiskers',
      pet_type: 'Cat',
      breed_id: '11111111-1111-4111-8111-111111111111',
      photo_url: 'https://example.com/photo.jpg',
      gender: 'Female',
      date_of_birth: '2022-01-15',
    });

    expect(result.success).toBe(true);
  });

  it('requires gender when adding a pet', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['gender'],
      message: 'Gender is required',
    });
  });

  it('rejects a gender outside Male/Female', () => {
    expect(
      createPetValidator.safeParse({
        name: 'Buddy',
        pet_type: 'Dog',
        gender: 'Unknown',
      }).success
    ).toBe(false);
  });

  it('AC-2: rejects a payload missing a required field', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
    });

    expect(result.success).toBe(false);
  });

  it('accepts any non-empty pet_type string - pet_type is a foreign key against the admin-managed pet_types table (20260912191), not a fixed enum, so an invalid/deactivated key is rejected by the DB constraint, not this validator', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: 'Bird',
      gender: 'Male',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty pet_type value', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized field', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
      gender: 'Male',
      branch_id: 'branch-a',
    });

    expect(result.success).toBe(false);
  });

  it('rejects health_conditions - no longer accepted here (Issue #78)', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
      gender: 'Male',
      health_conditions: 'Allergies',
    });

    expect(result.success).toBe(false);
  });

  it('rejects weight_class/coat_type - staff-only, manipulable pricing/cage fields (client interview finding)', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
      gender: 'Male',
      weight_class: 'M',
      coat_type: 'SC',
    });

    expect(result.success).toBe(false);
  });
});

describe('date_of_birth', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects a date of birth after today (Asia/Manila) on create and update', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T04:00:00.000Z')); // 12:00 Manila

    expect(
      createPetValidator.safeParse({
        name: 'Buddy',
        pet_type: 'Dog',
        gender: 'Male',
        date_of_birth: '2026-10-19',
      }).success
    ).toBe(false);
    expect(
      updatePetValidator.safeParse({ date_of_birth: '2027-01-01' }).success
    ).toBe(false);
  });

  it('accepts today and past dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T04:00:00.000Z'));

    for (const date_of_birth of ['2026-10-18', '2020-02-29']) {
      expect(
        createPetValidator.safeParse({
          name: 'Buddy',
          pet_type: 'Dog',
          gender: 'Male',
          date_of_birth,
        }).success
      ).toBe(true);
    }
  });

  it("uses Manila's date, not UTC's - today's Manila date is accepted before 08:00 Manila", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T18:00:00.000Z')); // 02:00 Oct 18 Manila

    expect(
      updatePetValidator.safeParse({ date_of_birth: '2026-10-18' }).success
    ).toBe(true);
  });

  it('rejects a value that is not YYYY-MM-DD', () => {
    expect(
      updatePetValidator.safeParse({ date_of_birth: 'yesterday' }).success
    ).toBe(false);
  });
});

describe('createPetValidatorStaff', () => {
  it('accepts weight_class/coat_type in addition to the customer-facing fields', () => {
    const result = createPetValidatorStaff.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
      gender: 'Male',
      weight_class: 'M',
      coat_type: 'SC',
    });

    expect(result.success).toBe(true);
  });

  it('accepts every coat type, Extra Long Coat included, and rejects an unknown one', () => {
    for (const coat_type of ['SC', 'LC', 'XLC']) {
      expect(
        createPetValidatorStaff.safeParse({
          name: 'Buddy',
          pet_type: 'Dog',
          gender: 'Male',
          weight_class: 'M',
          coat_type,
        }).success
      ).toBe(true);
    }

    expect(
      createPetValidatorStaff.safeParse({
        name: 'Buddy',
        pet_type: 'Dog',
        gender: 'Male',
        weight_class: 'M',
        coat_type: 'XXL',
      }).success
    ).toBe(false);
  });

  it('still accepts a payload without weight_class/coat_type (unassessed pet)', () => {
    const result = createPetValidatorStaff.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
      gender: 'Male',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a numeric weight_kg', () => {
    const result = createPetValidatorStaff.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
      gender: 'Male',
      weight_kg: 14.2,
      coat_type: 'SC',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a zero, negative or absurd weight_kg', () => {
    for (const weight_kg of [0, -3, 500, 9999]) {
      expect(
        createPetValidatorStaff.safeParse({
          name: 'Buddy',
          pet_type: 'Dog',
          gender: 'Male',
          weight_kg,
        }).success
      ).toBe(false);
    }
  });
});

describe('createPetValidator (customer-facing) - weight_kg', () => {
  it('rejects weight_kg - staff-only, manipulable pricing/cage field', () => {
    const result = createPetValidator.safeParse({
      name: 'Buddy',
      pet_type: 'Dog',
      gender: 'Male',
      weight_kg: 4,
    });

    expect(result.success).toBe(false);
  });
});

describe('updatePetValidator (customer-facing)', () => {
  it('accepts a partial payload', () => {
    const result = updatePetValidator.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('does not require gender - pets added before it was required stay editable', () => {
    expect(updatePetValidator.safeParse({ name: 'New Name' }).success).toBe(
      true
    );
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

  it('rejects weight_class/coat_type - staff-only', () => {
    const result = updatePetValidator.safeParse({ weight_class: 'M' });
    expect(result.success).toBe(false);
  });
});

describe('updatePetValidatorStaff', () => {
  it('accepts weight_class/coat_type', () => {
    const result = updatePetValidatorStaff.safeParse({
      weight_class: 'L',
      coat_type: 'LC',
    });
    expect(result.success).toBe(true);
  });
});
