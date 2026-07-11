import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../../../../../shared/auth/api/auth.api';
import { UnavailabilityBlockBadge } from './UnavailabilityBlockBadge';

vi.mock('../../../../../shared/auth/api/auth.api', () => ({
  getSupabaseClient: vi.fn(),
}));

function mockClient(blocks: Array<{ id: string; end_time: string }>) {
  return {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { access_token: 'token' } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: blocks, error: null }),
    }),
  };
}

describe('UnavailabilityBlockBadge', () => {
  it('shows "Available" when there is no active block', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      mockClient([]) as unknown as ReturnType<typeof getSupabaseClient>
    );

    render(
      createElement(UnavailabilityBlockBadge, {
        staffId: 'staff-1',
        accessToken: 'token',
      })
    );

    expect(await screen.findByText('Available')).toBeInTheDocument();
  });

  it('shows "Unavailable until" with a formatted time for an active block', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      mockClient([
        { id: 'block-1', end_time: '2026-07-11T17:00:00.000Z' },
      ]) as unknown as ReturnType<typeof getSupabaseClient>
    );

    render(
      createElement(UnavailabilityBlockBadge, {
        staffId: 'staff-1',
        accessToken: 'token',
      })
    );

    expect(await screen.findByText(/unavailable until/i)).toBeInTheDocument();
  });

  it('shows an error state when no Supabase client is configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);

    render(
      createElement(UnavailabilityBlockBadge, {
        staffId: 'staff-1',
        accessToken: null,
      })
    );

    expect(
      await screen.findByText('Unable to check availability')
    ).toBeInTheDocument();
  });

  it('re-checks status when refreshKey changes', async () => {
    const client = mockClient([]);
    vi.mocked(getSupabaseClient).mockReturnValue(
      client as unknown as ReturnType<typeof getSupabaseClient>
    );

    const { rerender } = render(
      createElement(UnavailabilityBlockBadge, {
        staffId: 'staff-1',
        accessToken: 'token',
        refreshKey: 0,
      })
    );

    await screen.findByText('Available');
    expect(client.from).toHaveBeenCalledTimes(1);

    rerender(
      createElement(UnavailabilityBlockBadge, {
        staffId: 'staff-1',
        accessToken: 'token',
        refreshKey: 1,
      })
    );

    await screen.findByText('Available');
    expect(client.from).toHaveBeenCalledTimes(2);
  });
});
