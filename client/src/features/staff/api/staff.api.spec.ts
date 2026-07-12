import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelUnavailabilityBlock,
  createUnavailabilityBlock,
  getStaffProfile,
  listPendingUnavailabilityRequests,
  listStaff,
  listUnavailabilityBlocks,
  reviewUnavailabilityRequest,
  updateStaffProfile,
  uploadAvatar,
} from './staff.api';

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('staff.api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getStaffProfile returns the unwrapped profile on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ staff: { id: 'staff-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getStaffProfile('staff-1', 'token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/staff/staff-1'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
      })
    );
    expect(result).toEqual({ data: { id: 'staff-1' }, error: null });
  });

  it('getStaffProfile returns an error instead of throwing when a 200 response is not valid JSON', async () => {
    // Regression test: a misconfigured dev proxy previously caused this
    // fetch to receive the SPA's index.html with a 200 status, and the
    // unguarded response.json() call threw inside an unawaited promise
    // chain, leaving callers stuck in a loading state forever.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected token '<'")),
      } as unknown as Response)
    );

    const result = await getStaffProfile('staff-1', 'token');

    expect(result).toEqual({
      data: null,
      error: 'Request failed. Please try again.',
    });
  });

  it('getStaffProfile surfaces the server error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'Forbidden' }, false))
    );

    const result = await getStaffProfile('staff-1', 'token');

    expect(result).toEqual({ data: null, error: 'Forbidden' });
  });

  it('updateStaffProfile PATCHes the payload and returns the updated profile', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        staff: { id: 'staff-1', display_name: 'New Name' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateStaffProfile('staff-1', 'token', {
      display_name: 'New Name',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/staff/staff-1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ display_name: 'New Name' }),
      })
    );
    expect(result.data?.display_name).toBe('New Name');
  });

  it('uploadAvatar posts multipart form data and returns the new URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ profile_photo_url: 'https://cdn/avatar.png' })
      );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['x'], 'avatar.png', { type: 'image/png' });
    const result = await uploadAvatar('staff-1', 'token', file);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(FormData);
    expect(result).toEqual({
      data: { profile_photo_url: 'https://cdn/avatar.png' },
      error: null,
    });
  });

  it('listUnavailabilityBlocks returns the unwrapped blocks array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ blocks: [{ id: 'block-1' }] }))
    );

    const result = await listUnavailabilityBlocks('staff-1', 'token');

    expect(result.data).toEqual([{ id: 'block-1' }]);
  });

  it('createUnavailabilityBlock posts the payload and returns the created block', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ block: { id: 'block-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createUnavailabilityBlock('staff-1', 'token', {
      quick_action: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/staff/staff-1/unavailability'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.data).toEqual({ id: 'block-1' });
  });

  it('createUnavailabilityBlock surfaces a 409 overlap error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: 'Block overlaps an existing unavailability block' },
            false
          )
        )
    );

    const result = await createUnavailabilityBlock('staff-1', 'token', {
      quick_action: true,
    });

    expect(result.error).toBe(
      'Block overlaps an existing unavailability block'
    );
  });

  it('cancelUnavailabilityBlock resolves with no error on a 204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.resolve(null),
      })
    );

    const result = await cancelUnavailabilityBlock(
      'staff-1',
      'token',
      'block-1'
    );

    expect(result).toEqual({ data: null, error: null });
  });

  it('listPendingUnavailabilityRequests returns the unwrapped blocks array', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ blocks: [{ id: 'block-1' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await listPendingUnavailabilityRequests('token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/staff/unavailability/pending'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
      })
    );
    expect(result.data).toEqual([{ id: 'block-1' }]);
  });

  it('reviewUnavailabilityRequest PATCHes the decision and returns the updated block', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ block: { id: 'block-1', status: 'approved' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await reviewUnavailabilityRequest(
      'staff-2',
      'block-1',
      'token',
      { decision: 'approved' }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/staff/staff-2/unavailability/block-1/review'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ decision: 'approved' }),
      })
    );
    expect(result.data).toEqual({ id: 'block-1', status: 'approved' });
  });

  it('reviewUnavailabilityRequest surfaces the cannot_review_own_request error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'cannot_review_own_request' }, false)
        )
    );

    const result = await reviewUnavailabilityRequest(
      'staff-2',
      'block-1',
      'token',
      { decision: 'approved' }
    );

    expect(result.error).toBe('cannot_review_own_request');
  });

  it('listStaff returns the unwrapped staff array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ staff: [{ id: 'staff-1' }] }))
    );

    const result = await listStaff('token');

    expect(result.data).toEqual([{ id: 'staff-1' }]);
  });
});
