import { describe, expect, it } from 'vitest';
import {
  createStaffFoodItemValidator,
  createStaffMedicationItemValidator,
  updateStaffFoodItemValidator,
  updateStaffMedicationItemValidator,
} from './staffItems.validator.ts';

describe('staffItems.validator', () => {
  it('createStaffFoodItemValidator defaults is_public to false', () => {
    const parsed = createStaffFoodItemValidator.parse({
      name: 'Kibble',
      quantity: '1',
    });
    expect(parsed.is_public).toBe(false);
  });

  it('createStaffFoodItemValidator rejects an unknown quantity_unit', () => {
    const result = createStaffFoodItemValidator.safeParse({
      name: 'Kibble',
      quantity: '1',
      quantity_unit: 'bucket',
    });
    expect(result.success).toBe(false);
  });

  it('createStaffFoodItemValidator rejects unknown fields (.strict())', () => {
    const result = createStaffFoodItemValidator.safeParse({
      name: 'Kibble',
      quantity: '1',
      price: 10,
    });
    expect(result.success).toBe(false);
  });

  it('updateStaffFoodItemValidator allows a partial payload', () => {
    const result = updateStaffFoodItemValidator.safeParse({ is_public: true });
    expect(result.success).toBe(true);
  });

  it('createStaffMedicationItemValidator defaults is_public to false', () => {
    const parsed = createStaffMedicationItemValidator.parse({
      name: 'Amoxicillin',
      dose: '1 tablet',
    });
    expect(parsed.is_public).toBe(false);
  });

  it('createStaffMedicationItemValidator rejects an unknown dose_unit', () => {
    const result = createStaffMedicationItemValidator.safeParse({
      name: 'Amoxicillin',
      dose: '1',
      dose_unit: 'gallon',
    });
    expect(result.success).toBe(false);
  });

  it('updateStaffMedicationItemValidator allows a partial payload', () => {
    const result = updateStaffMedicationItemValidator.safeParse({
      is_public: false,
    });
    expect(result.success).toBe(true);
  });
});
