import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminPromosAndRewardsPage } from './AdminPromosAndRewardsPage';

vi.mock('../AdminPromoConfigPage/AdminPromoConfigPage', () => ({
  AdminPromoConfigPage: () => createElement('div', null, 'Promos content'),
}));
vi.mock(
  '../../../rewards/pages/AdminSpinWheelConfigPage/AdminSpinWheelConfigPage',
  () => ({
    AdminSpinWheelConfigPage: () =>
      createElement('div', null, 'Spin Wheel content'),
  })
);

describe('AdminPromosAndRewardsPage', () => {
  it('defaults to the Promos section', () => {
    render(createElement(AdminPromosAndRewardsPage));

    expect(screen.getByText('Promos content')).toBeInTheDocument();
    expect(screen.queryByText('Spin Wheel content')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Promos' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('switches to Coupon Spin Wheel without touching Promos content', async () => {
    render(createElement(AdminPromosAndRewardsPage));
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: 'Coupon Spin Wheel' }));

    expect(screen.getByText('Spin Wheel content')).toBeInTheDocument();
    expect(screen.queryByText('Promos content')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Coupon Spin Wheel' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
