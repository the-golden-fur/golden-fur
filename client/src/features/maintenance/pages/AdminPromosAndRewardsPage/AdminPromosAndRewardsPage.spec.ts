import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminPromosAndRewardsPage } from './AdminPromosAndRewardsPage';

vi.mock('../AdminPromoConfigPage/AdminPromoConfigPage', () => ({
  AdminPromoConfigPage: () => createElement('div', null, 'Promos content'),
}));
vi.mock('../../../rewards/pages/AdminRewardsPage/AdminRewardsPage', () => ({
  AdminRewardsPage: () => createElement('div', null, 'Rewards content'),
}));
vi.mock(
  '../../../rewards/pages/AdminRewardPoolsPage/AdminRewardPoolsPage',
  () => ({
    AdminRewardPoolsPage: () =>
      createElement('div', null, 'Reward Pools content'),
  })
);

describe('AdminPromosAndRewardsPage', () => {
  it('defaults to the Promos section', () => {
    render(createElement(AdminPromosAndRewardsPage));

    expect(screen.getByText('Promos content')).toBeInTheDocument();
    expect(screen.queryByText('Rewards content')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Promos' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('session 114: has Promos, Rewards, and Reward Pools tabs - no Coupon Spin Wheel tab', () => {
    render(createElement(AdminPromosAndRewardsPage));

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Promos',
      'Rewards',
      'Reward Pools',
    ]);
    expect(
      screen.queryByRole('tab', { name: 'Coupon Spin Wheel' })
    ).not.toBeInTheDocument();
  });

  it('switches between Rewards and Reward Pools', async () => {
    render(createElement(AdminPromosAndRewardsPage));
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: 'Rewards' }));
    expect(screen.getByText('Rewards content')).toBeInTheDocument();
    expect(screen.queryByText('Promos content')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Reward Pools' }));
    expect(screen.getByText('Reward Pools content')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Reward Pools' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
