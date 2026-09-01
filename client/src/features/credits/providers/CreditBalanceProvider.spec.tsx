import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../shared/auth/providers/AuthProvider/useAuth';
import { listCreditBalances } from '../api/credits.api';
import { CreditBalanceProvider } from './CreditBalanceProvider';
import { notifyCreditBalanceChanged } from './creditBalanceEvents';
import { useCreditBalance } from './useCreditBalance';

vi.mock('../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../api/credits.api', () => ({
  listCreditBalances: vi.fn(),
}));

function Probe() {
  const { total } = useCreditBalance();
  return createElement('span', { 'data-testid': 'total' }, String(total));
}

function renderProvider() {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(CreditBalanceProvider, null, createElement(Probe))
    )
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('CreditBalanceProvider', () => {
  it('sums balances numerically even when the API yields numeric strings', async () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: 'token' } as never);
    vi.mocked(listCreditBalances).mockResolvedValue({
      data: [{ balance: '500.00' }, { balance: '250.50' }] as never,
      error: null,
    });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('total')).toHaveTextContent('750.5')
    );
  });

  it('re-fetches when the tab regains focus', async () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: 'token' } as never);
    vi.mocked(listCreditBalances).mockResolvedValue({ data: [], error: null });

    renderProvider();
    await waitFor(() => expect(listCreditBalances).toHaveBeenCalled());
    const callsAfterMount = vi.mocked(listCreditBalances).mock.calls.length;

    window.dispatchEvent(new Event('focus'));

    await waitFor(() =>
      expect(
        vi.mocked(listCreditBalances).mock.calls.length
      ).toBeGreaterThan(callsAfterMount)
    );
  });

  it('re-fetches on a credit-balance-changed event', async () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: 'token' } as never);
    vi.mocked(listCreditBalances).mockResolvedValue({ data: [], error: null });

    renderProvider();
    await waitFor(() => expect(listCreditBalances).toHaveBeenCalled());
    const before = vi.mocked(listCreditBalances).mock.calls.length;

    notifyCreditBalanceChanged();

    await waitFor(() =>
      expect(vi.mocked(listCreditBalances).mock.calls.length).toBeGreaterThan(
        before
      )
    );
  });

  it('keeps the last good balance when a later fetch errors', async () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: 'token' } as never);
    vi.mocked(listCreditBalances)
      .mockResolvedValueOnce({
        data: [{ balance: 693 }] as never,
        error: null,
      })
      .mockResolvedValue({ data: null, error: 'boom' });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('total')).toHaveTextContent('693')
    );

    window.dispatchEvent(new Event('focus'));

    // still 693 after the failing refetch
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('total')).toHaveTextContent('693');
  });
});
