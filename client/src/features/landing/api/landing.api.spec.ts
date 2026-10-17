import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LANDING_BRANCHES,
  DEFAULT_LANDING_TEXT,
} from '../landing.content';
import {
  fetchPublicLanding,
  loadLandingPage,
  updateLandingContent,
  uploadLandingImage,
} from './landing.api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn();

describe('landing.api', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reads the public content with no auth header', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ content: {}, sections: {}, reviews: [] })
    );

    const result = await fetchPublicLanding();

    expect(result.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/public\/landing$/)
    );
  });

  it('treats a non-JSON reply (the SPA’s HTML) as an error, not a throw', async () => {
    fetchMock.mockResolvedValue(
      new Response('<!doctype html>', { status: 200 })
    );

    await expect(fetchPublicLanding()).resolves.toEqual({
      data: null,
      error: expect.any(String),
    });
  });

  it('loadLandingPage lays loaded content over the defaults', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/public/landing')
          ? jsonResponse({
              content: { 'hero.title_lead': 'Saved headline' },
              sections: {},
              reviews: [],
            })
          : jsonResponse({ branches: [] })
      )
    );

    const landing = await loadLandingPage();

    expect(landing.text['hero.title_lead']).toBe('Saved headline');
    expect(landing.text['cta.title']).toBe(DEFAULT_LANDING_TEXT['cta.title']);
    expect(landing.branches).toEqual([]);
  });

  it('loadLandingPage gives up on a slow server and shows the defaults', async () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValue(new Promise(() => {}));

    const pending = loadLandingPage(1000);
    await vi.advanceTimersByTimeAsync(1000);
    const landing = await pending;

    expect(landing.text['hero.title_lead']).toBe(
      DEFAULT_LANDING_TEXT['hero.title_lead']
    );
    expect(landing.branches).toBe(DEFAULT_LANDING_BRANCHES);
  });

  it('sends text edits as one batch with the Superadmin’s token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: [] }));

    await updateLandingContent('token', [{ key: 'cta.title', value: 'Hi' }]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/maintenance\/landing\/content$/);
    expect(init.method).toBe('PATCH');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token' });
    expect(JSON.parse(init.body as string)).toEqual({
      updates: [{ key: 'cta.title', value: 'Hi' }],
    });
  });

  it('uploads an image as multipart form data under "image"', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ item: { key: 'hero.image', value: 'https://x/y.png' } })
    );
    const file = new File(['png'], 'hero.png', { type: 'image/png' });

    const result = await uploadLandingImage('token', 'hero.image', file);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/maintenance\/landing\/images\/hero\.image$/);
    expect((init.body as FormData).get('image')).toBe(file);
    expect(result.data?.value).toBe('https://x/y.png');
  });

  it('passes a server error message through', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'File too large' }, 400));
    const file = new File(['png'], 'hero.png', { type: 'image/png' });

    await expect(
      uploadLandingImage('token', 'hero.image', file)
    ).resolves.toEqual({ data: null, error: 'File too large' });
  });
});
