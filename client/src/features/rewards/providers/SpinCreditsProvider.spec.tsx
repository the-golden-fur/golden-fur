import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../shared/auth/providers/AuthProvider/useAuth';
import { checkIn, getMySpinCredits } from '../api/rewards.api';
import { SpinCreditsProvider } from './SpinCreditsProvider';
import { notifySpinCreditsChanged } from './spinCreditsEvents';
import { useSpinCredits } from './useSpinCredits';

vi.mock('../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../api/rewards.api', () => ({
  checkIn: vi.fn(),
  getMySpinCredits: vi.fn(),
}));

function Probe() {
  const { total } = useSpinCredits();
  return createElement('span', { 'data-testid': 'total' }, String(total));
}

function renderProvider() {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(SpinCreditsProvider, null, createElement(Probe))
    )
  );
}

const SUMMARY = {
  total: 2,
  byPromo: [{ promoId: 'promo-1', promoName: 'Loyalty Spin', count: 2 }],
};

describe('SpinCreditsProvider (session 114)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      user: { id: 'customer-1' },
    } as never);
    vi.mocked(checkIn).mockResolvedValue({
      data: { granted: [], credits: SUMMARY },
      error: null,
    });
    vi.mocked(getMySpinCredits).mockResolvedValue({
      data: SUMMARY,
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('checks in on the first load of the day and shows the returned total', async () => {
    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('total')).toHaveTextContent('2')
    );
    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(getMySpinCredits).not.toHaveBeenCalled();
  });

  it('checks in only once per day - later refreshes just read the summary', async () => {
    renderProvider();
    await waitFor(() => expect(checkIn).toHaveBeenCalledTimes(1));

    notifySpinCreditsChanged();

    await waitFor(() => expect(getMySpinCredits).toHaveBeenCalled());
    expect(checkIn).toHaveBeenCalledTimes(1);
  });

  it('retries the check-in on the next refresh if it failed', async () => {
    vi.mocked(checkIn).mockResolvedValueOnce({
      data: null,
      error: 'network down',
    });

    renderProvider();
    await waitFor(() => expect(checkIn).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(checkIn).toHaveBeenCalledTimes(2));
  });
});
