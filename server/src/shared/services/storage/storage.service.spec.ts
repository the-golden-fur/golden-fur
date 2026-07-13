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

describe('storage.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upload', () => {
    it('returns a usable URL on success', async () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi
          .fn()
          .mockResolvedValue({ data: { path: 'pets/1/photo.png' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/pets/1/photo.png' },
        }),
      } as never);

      const url = await upload('pet-photos', 'pets/1/photo.png', {
        buffer: Buffer.from('image-bytes'),
        contentType: 'image/png',
      });

      expect(url).toBe('https://example.com/pets/1/photo.png');
      expect(supabase.storage.from).toHaveBeenCalledWith('pet-photos');
    });

    it('throws a ConflictError when the object already exists', async () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'The resource already exists' },
        }),
      } as never);

      await expect(
        upload('pet-photos', 'pets/1/photo.png', {
          buffer: Buffer.from('image-bytes'),
        })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('throws a generic AppError on other upload failures', async () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        upload: vi
          .fn()
          .mockResolvedValue({ data: null, error: { message: 'Network error' } }),
      } as never);

      await expect(
        upload('pet-photos', 'pets/1/photo.png', {
          buffer: Buffer.from('image-bytes'),
        })
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('getPublicUrl', () => {
    it('returns the public URL for a path', () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        getPublicUrl: vi
          .fn()
          .mockReturnValue({ data: { publicUrl: 'https://example.com/x.png' } }),
      } as never);

      expect(getPublicUrl('pet-photos', 'x.png')).toBe(
        'https://example.com/x.png'
      );
    });

    it('throws an AppError when no public URL is resolved', () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        getPublicUrl: vi.fn().mockReturnValue({ data: null }),
      } as never);

      expect(() => getPublicUrl('pet-photos', 'x.png')).toThrow(AppError);
    });
  });

  describe('remove', () => {
    it('deletes the target object', async () => {
      const removeMock = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.storage.from).mockReturnValue({
        remove: removeMock,
      } as never);

      await remove('pet-photos', 'pets/1/photo.png');

      expect(supabase.storage.from).toHaveBeenCalledWith('pet-photos');
      expect(removeMock).toHaveBeenCalledWith(['pets/1/photo.png']);
    });

    it('throws an AppError when deletion fails', async () => {
      vi.mocked(supabase.storage.from).mockReturnValue({
        remove: vi
          .fn()
          .mockResolvedValue({ error: { message: 'Object not found' } }),
      } as never);

      await expect(remove('pet-photos', 'missing.png')).rejects.toBeInstanceOf(
        AppError
      );
    });
  });
});
