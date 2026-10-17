import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetLandingImage, uploadLandingImage } from './landingImage.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';

const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn(() => storage) },
  },
}));

/** Answers the slot lookup with `kind`, and the final update with the row
 * it was asked to write. */
function mockSlot(kind: 'text' | 'image' | null) {
  vi.mocked(supabase.from).mockImplementation((() => {
    let updated: Record<string, unknown> | null = null;
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      update: vi.fn((values: Record<string, unknown>) => {
        updated = values;
        return builder;
      }),
      maybeSingle: vi.fn(() =>
        Promise.resolve({
          data: updated
            ? { key: 'hero.image', kind: 'image', ...updated }
            : kind
              ? { kind }
              : null,
          error: null,
        })
      ),
    };
    return builder;
  }) as never);
}

const PNG = {
  buffer: Buffer.from('png'),
  mimetype: 'image/png',
  originalname: 'my hero.png',
  size: 3,
};

describe('landingImage.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.upload.mockResolvedValue({
      data: { path: 'hero.image/1-my_hero.png' },
      error: null,
    });
    storage.list.mockResolvedValue({
      data: [{ name: '1-my_hero.png' }, { name: '0-old.png' }],
      error: null,
    });
    storage.remove.mockResolvedValue({ data: [], error: null });
    storage.getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://cdn.example/hero.image/1-my_hero.png' },
    });
  });

  it('stores the file, removes the slot’s older files and saves the URL', async () => {
    mockSlot('image');

    const item = await uploadLandingImage('hero.image', PNG);

    expect(storage.upload.mock.calls[0][0]).toMatch(
      /^hero\.image\/\d+-my_hero\.png$/
    );
    expect(storage.remove).toHaveBeenCalledWith(['hero.image/0-old.png']);
    expect(item.value).toBe('https://cdn.example/hero.image/1-my_hero.png');
  });

  it('rejects an unsupported type or an oversize file before uploading', async () => {
    mockSlot('image');

    await expect(
      uploadLandingImage('hero.image', { ...PNG, mimetype: 'image/svg+xml' })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      uploadLandingImage('hero.image', { ...PNG, size: 5 * 1024 * 1024 + 1 })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      uploadLandingImage('hero.image', undefined)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('refuses a text slot or an unknown key', async () => {
    mockSlot('text');
    await expect(
      uploadLandingImage('hero.title_lead', PNG)
    ).rejects.toMatchObject({ statusCode: 400 });

    mockSlot(null);
    await expect(uploadLandingImage('made.up', PNG)).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('reset clears the slot back to the bundled image and deletes its files', async () => {
    mockSlot('image');

    const item = await resetLandingImage('hero.image');

    expect(storage.remove).toHaveBeenCalledWith([
      'hero.image/1-my_hero.png',
      'hero.image/0-old.png',
    ]);
    expect(item.value).toBeNull();
  });
});
