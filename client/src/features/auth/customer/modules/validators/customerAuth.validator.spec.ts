import { describe, expect, it } from 'vitest';
import {
  customerLoginSchema,
  customerSignupSchema,
} from './customerAuth.validator';

describe('customerAuth.validator', () => {
  it('validates a customer signup payload', () => {
    const parsed = customerSignupSchema.safeParse({
      full_name: 'Ada Lovelace',
      account_email: 'ada@example.com',
      password: 'supersecret',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects a login payload with an invalid email', () => {
    const parsed = customerLoginSchema.safeParse({
      account_email: 'not-an-email',
      password: 'password123',
    });

    expect(parsed.success).toBe(false);
  });
});
