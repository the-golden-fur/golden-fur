import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFaq,
  deleteFaq,
  fetchPublicFaqs,
  listFaqs,
  updateFaq,
} from './faq.api';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const FAQ = {
  id: 'faq-1',
  question: 'Q?',
  answer: 'A.',
  sort_order: 1,
  is_active: true,
  created_at: '2026-10-06T00:00:00.000Z',
  updated_at: '2026-10-06T00:00:00.000Z',
};

describe('faq.api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchPublicFaqs reads the public list with no auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        faqs: [{ id: 'faq-1', question: 'Q?', answer: 'A.' }],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchPublicFaqs();

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/public\/faqs$/);
    expect(fetchMock.mock.calls[0][1]).toBeUndefined();
    expect(result).toEqual({
      data: [{ id: 'faq-1', question: 'Q?', answer: 'A.' }],
      error: null,
    });
  });

  it('fetchPublicFaqs reports a failed request instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await fetchPublicFaqs();

    expect(result.data).toBeNull();
    expect(result.error).toEqual(expect.any(String));
  });

  it('fetchPublicFaqs reports a response that is not the FAQ list', async () => {
    // What a missing dev proxy looks like: 200 OK with the SPA's HTML.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('not json')),
      } as Response)
    );

    const result = await fetchPublicFaqs();

    expect(result.data).toBeNull();
    expect(result.error).toEqual(expect.any(String));
  });

  it('listFaqs sends the staff token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ faqs: [FAQ] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await listFaqs('token');

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/maintenance\/faqs$/);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer token',
    });
    expect(result.data).toEqual([FAQ]);
  });

  it('createFaq POSTs the question and answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ faq: FAQ }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createFaq('token', { question: 'Q?', answer: 'A.' });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ question: 'Q?', answer: 'A.' }),
    });
    expect(result.data).toEqual(FAQ);
  });

  it('updateFaq PATCHes only what it is given', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ faq: { ...FAQ, is_active: false } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateFaq('faq-1', 'token', { is_active: false });

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/maintenance\/faqs\/faq-1$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    });
    expect(result.data?.is_active).toBe(false);
  });

  it('deleteFaq DELETEs and surfaces the server message on failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response)
      .mockResolvedValueOnce(jsonResponse({ error: 'FAQ not found' }, false));
    vi.stubGlobal('fetch', fetchMock);

    expect(await deleteFaq('faq-1', 'token')).toEqual({ error: null });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
    expect(await deleteFaq('missing', 'token')).toEqual({
      error: 'FAQ not found',
    });
  });
});
