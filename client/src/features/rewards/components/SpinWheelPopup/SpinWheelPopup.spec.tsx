import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getPromoWheel, spinTheWheel } from '../../api/rewards.api';
import {
  SpinCreditsContext,
  type SpinCreditsContextValue,
} from '../../providers/SpinCreditsContext';
import type { SpinCreditSummary } from '../../rewards.types';
import { SpinWheelPopup } from './SpinWheelPopup';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/rewards.api', () => ({
  getPromoWheel: vi.fn(),
  spinTheWheel: vi.fn(),
}));

// The real wheel animates via a CSS transition that jsdom never finishes -
// the stand-in reports "animation complete" as soon as it gets a result.
vi.mock('../SpinWheel/SpinWheel', () => ({
  SpinWheel: ({
    resultRewardId,
    onAnimationComplete,
  }: {
    resultRewardId: string | null;
    onAnimationComplete?: () => void;
  }) =>
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'wheel',
        onClick: () => onAnimationComplete?.(),
      },
      resultRewardId ? 'landed' : 'idle'
    ),
}));

function summaryOf(count: number): SpinCreditSummary {
  return {
    total: count,
    byPromo:
      count > 0
        ? [{ promoId: 'promo-1', promoName: 'Loyalty Spin', count }]
        : [],
  };
}

function renderPopup(summary: SpinCreditSummary, path = '/portal') {
  const value: SpinCreditsContextValue = {
    summary,
    total: summary.total,
    isLoading: false,
    refresh: vi.fn(),
  };

  const tree = (next: SpinCreditsContextValue) =>
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        SpinCreditsContext.Provider,
        { value: next },
        createElement(SpinWheelPopup)
      )
    );

  const utils = render(tree(value));

  return {
    ...utils,
    setSummary: (next: SpinCreditSummary) =>
      utils.rerender(tree({ ...value, summary: next, total: next.total })),
  };
}

describe('SpinWheelPopup (session 114)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    vi.mocked(useAuth).mockReturnValue({
      accessToken: 'token',
      user: { id: 'customer-1' },
    } as never);
    vi.mocked(getPromoWheel).mockResolvedValue({
      data: {
        promoId: 'promo-1',
        promoName: 'Loyalty Spin',
        rarestTier: 'Legendary',
        pityThreshold: 10,
        rewards: [
          {
            id: 'reward-1',
            label: '10% off',
            discount_type: 'Percentage',
            value: 10,
            rarity_tier: 'Common',
            chance_percent: 100,
          },
        ],
      },
      error: null,
    });
  });

  it('stays closed when there are no spins', () => {
    renderPopup(summaryOf(0));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('pops up with the spin count when the customer has spins', async () => {
    renderPopup(summaryOf(2));

    expect(
      screen.getByRole('dialog', { name: "You've earned a spin!" })
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('You have 2 spins');
    expect(await screen.findByTestId('wheel')).toBeInTheDocument();
  });

  it('never opens on My Rewards (the wheel is already there)', () => {
    renderPopup(summaryOf(2), '/portal/rewards');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Skip for now" keeps the spins and only reopens once another spin is earned', async () => {
    const user = userEvent.setup();
    const { setSummary } = renderPopup(summaryOf(2));

    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(spinTheWheel).not.toHaveBeenCalled();

    // Same count again (e.g. a later page) - still skipped.
    setSummary(summaryOf(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // A newly earned spin brings it back.
    setSummary(summaryOf(3));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('spins the chosen promo and announces the win', async () => {
    vi.mocked(spinTheWheel).mockResolvedValue({
      data: {
        rewardId: 'reward-1',
        wasPity: false,
        couponId: 'coupon-1',
        historyId: 'history-1',
        promoId: 'promo-1',
      },
      error: null,
    });

    const user = userEvent.setup();
    renderPopup(summaryOf(1));
    await screen.findByTestId('wheel');

    await user.click(screen.getByRole('button', { name: 'Spin now' }));

    await waitFor(() =>
      expect(spinTheWheel).toHaveBeenCalledWith('token', {
        promoId: 'promo-1',
      })
    );
    expect(await screen.findByText('landed')).toBeInTheDocument();

    // Stand-in wheel: clicking it simulates the animation finishing.
    await user.click(screen.getByTestId('wheel'));

    expect(
      await screen.findByText("You won: 10% off! It's waiting in My Coupons.")
    ).toBeInTheDocument();
  });
});
