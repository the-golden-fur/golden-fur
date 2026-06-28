import { describe, expect, it } from 'vitest';
import { getSession, signOut } from './auth.api';

describe('auth.api', () => {
  it('returns a null session when no Supabase client is configured', async () => {
    const result = await getSession();

    expect(result.data.session).toBeNull();
  });

  it('returns a successful sign-out result when no client is configured', async () => {
    const result = await signOut();

    expect(result.error).toBeNull();
  });
});
