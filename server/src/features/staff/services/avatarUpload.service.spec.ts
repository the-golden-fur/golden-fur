import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadStaffAvatar } from './avatarUpload.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
    from: vi.fn(),
  },
}));

function createFile(
  overrides: Partial<{
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  }> = {}
) {
  return {
    buffer: Buffer.from('avatar-image'),
    mimetype: 'image/png',
    originalname: 'avatar.png',
    size: 1024,
    ...overrides,
  };
}

describe('uploadStaffAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a valid avatar and updates the staff profile', async () => {
    const uploadResult = { data: { path: 'staff-1/avatar.png' }, error: null };
    const listResult = { data: [{ name: 'old.png' }], error: null };
    const removeResult = { data: null, error: null };
    const profileResult = {
      data: { id: 'staff-1', profile_photo_url: null },
      error: null,
    };

    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: vi.fn().mockResolvedValue(uploadResult),
      list: vi.fn().mockResolvedValue(listResult),
      remove: vi.fn().mockResolvedValue(removeResult),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: 'https://example.com/avatar.png' },
      }),
    } as never);

    vi.mocked(supabase.from).mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue(profileResult),
          }),
        }),
      }),
    } as never);

    const result = await uploadStaffAvatar({
      requesterId: 'staff-1',
      requesterRole: 'Receptionist',
      targetId: 'staff-1',
      file: createFile(),
    });

    expect(result.avatarUrl).toContain('avatar.png');
    expect(supabase.storage.from).toHaveBeenCalledWith('avatars');
    expect(supabase.from).toHaveBeenCalledWith('staff_profiles');
  });

  it('rejects oversized or forbidden mime types before any storage write', async () => {
    await expect(
      uploadStaffAvatar({
        requesterId: 'staff-1',
        requesterRole: 'Receptionist',
        targetId: 'staff-1',
        file: createFile({ size: 6 * 1024 * 1024, mimetype: 'image/gif' }),
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(supabase.storage.from).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
