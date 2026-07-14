import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicUrl, remove, upload } from './storage.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { AppError } from '../../errors/AppError.ts';
import { ConflictError } from '../../errors/ConflictError.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

function createFile(
  overrides: Partial<{ buffer: Buffer; mimetype: string }> = {}
) {
  return {
    buffer: Buffer.from('file-bytes'),
    mimetype: 'image/png',
    ...overrides,
  };
}

describe('storage.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upload', () => {
    it('returns a public URL on success', async () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi
          .fn()
          .mockResolvedValue({
            data: { path: 'pets/1/photo.png' },
            error: null,
          }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/pets/1/photo.png' },
        }),
      } as never);

      const url = await upload('pet-photos', 'pets/1/photo.png', createFile());

      expect(url).toBe('https://example.com/pets/1/photo.png');
      expect(supabase.storage.from).toHaveBeenCalledWith('pet-photos');
    });

    it('throws a typed error when the upload fails', async () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi
          .fn()
          .mockResolvedValue({ data: null, error: { message: 'bucket full' } }),
      } as never);

      await expect(
        upload('pet-photos', 'pets/1/photo.png', createFile())
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('getPublicUrl', () => {
    it('returns the resolved URL', () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        getPublicUrl: vi
          .fn()
          .mockReturnValue({
            data: { publicUrl: 'https://example.com/a.png' },
          }),
      } as never);

      expect(getPublicUrl('avatars', 'a.png')).toBe(
        'https://example.com/a.png'
      );
    });

    it('throws an AppError when no URL is resolved', () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        getPublicUrl: vi.fn().mockReturnValue({ data: null }),
      } as never);

      expect(() => getPublicUrl('avatars', 'a.png')).toThrow(AppError);
    });
  });

  describe('remove', () => {
    it('deletes the target object', async () => {
      const removeMock = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.storage.from).mockReturnValue({
        remove: removeMock,
      } as never);

      await remove('avatars', 'staff-1/old.png');

      expect(removeMock).toHaveBeenCalledWith(['staff-1/old.png']);
    });

    it('throws a typed error when deletion fails', async () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        remove: vi
          .fn()
          .mockResolvedValue({ error: { message: 'object not found' } }),
      } as never);

      await expect(remove('avatars', 'staff-1/old.png')).rejects.toBeInstanceOf(
        ConflictError
      );
    });
  });
});
