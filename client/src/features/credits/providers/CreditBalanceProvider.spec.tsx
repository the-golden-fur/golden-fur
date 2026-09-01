import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../shared/auth/providers/AuthProvider/useAuth';
import { listCreditBalances } from '../api/credits.api';
import { CreditBalanceProvider } from './CreditBalanceProvider';
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
    createElement(CreditBalanceProvider, null, createElement(Probe))
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

  it('re-fetches the balance when the tab regains focus', async () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: 'token' } as never);
    vi.mocked(listCreditBalances).mockResolvedValue({ data: [], error: null });

    renderProvider();

    await waitFor(() => expect(listCreditBalances).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(listCreditBalances).toHaveBeenCalledTimes(2));
  });
});
