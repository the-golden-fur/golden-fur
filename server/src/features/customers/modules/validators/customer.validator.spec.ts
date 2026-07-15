import { describe, expect, it } from 'vitest';
import { updateCustomerProfileValidator } from './customer.validator.ts';

describe('updateCustomerProfileValidator', () => {
  it('accepts a valid partial payload', () => {
    const result = updateCustomerProfileValidator.safeParse({
      full_name: 'Jane Dela Cruz',
      contact_number: '09171234567',
      preferred_communication_channel: 'Viber',
    });

    expect(result.success).toBe(true);
  });

  it('accepts an empty payload', () => {
    const result = updateCustomerProfileValidator.safeParse({});
    expect(result.success).toBe(true);
  });

  it('AC-5: rejects an account_email field', () => {
    const result = updateCustomerProfileValidator.safeParse({
      account_email: 'new@example.com',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized field', () => {
    const result = updateCustomerProfileValidator.safeParse({
      role: 'Admin',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty full_name', () => {
    const result = updateCustomerProfileValidator.safeParse({
      full_name: '   ',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid communication channel', () => {
    const result = updateCustomerProfileValidator.safeParse({
      preferred_communication_channel: 'Email',
    });

    expect(result.success).toBe(false);
  });
});
