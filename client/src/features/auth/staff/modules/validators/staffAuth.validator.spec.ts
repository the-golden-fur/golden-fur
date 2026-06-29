import { describe, expect, it } from 'vitest';
import { staffAuthValidator, totpValidator } from './staffAuth.validator';

describe('staffAuth.validator', () => {
  it('accepts a username and password payload', () => {
    const result = staffAuthValidator.safeParse({
      username: 'james',
      password: 'correct-horse-battery-staple',
    });

    expect(result.success).toBe(true);
  });

  it('rejects empty credentials', () => {
    const result = staffAuthValidator.safeParse({ username: '', password: '' });

    expect(result.success).toBe(false);
  });
});

describe('totpValidator', () => {
  it('accepts a six-digit code', () => {
    const result = totpValidator.safeParse({ code: '123456' });

    expect(result.success).toBe(true);
  });

  it('rejects a non-six-digit code', () => {
    const result = totpValidator.safeParse({ code: '12345' });

    expect(result.success).toBe(false);
  });
});
