import { describe, expect, it } from 'vitest';
import { avatarFileSchema } from './avatarFileSchema';

describe('avatarFileSchema', () => {
  it('accepts a valid png under the size limit', () => {
    const file = new File(['x'], 'avatar.png', { type: 'image/png' });

    expect(avatarFileSchema.safeParse(file).success).toBe(true);
  });

  it('rejects an unsupported mime type', () => {
    const file = new File(['x'], 'avatar.gif', { type: 'image/gif' });

    const result = avatarFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it('rejects a file over 5MB', () => {
    const bigContent = new Uint8Array(5 * 1024 * 1024 + 1);
    const file = new File([bigContent], 'avatar.png', { type: 'image/png' });

    const result = avatarFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });
});
