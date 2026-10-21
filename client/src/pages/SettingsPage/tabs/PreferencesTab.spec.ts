import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TourContext } from '../../../features/customers/tour/tourContext';
import { PreferencesTab } from './PreferencesTab';

// The other panels have their own specs - stubbed so this one is only about
// the Tutorial panel.
vi.mock('../../../shared/components/ThemeToggle/ThemeToggle', () => ({
  ThemeToggle: () => null,
}));
vi.mock('../../../shared/components/FontSizeSlider/FontSizeSlider', () => ({
  FontSizeSlider: () => null,
}));
vi.mock('../../../shared/components/WeightUnitToggle/WeightUnitToggle', () => ({
  WeightUnitToggle: () => null,
}));
vi.mock('./NotificationPreferencesGrid', () => ({
  NotificationPreferencesGrid: () => null,
}));

function renderTab(role: 'customer' | 'staff', openSectionPicker = vi.fn()) {
  render(
    createElement(
      TourContext.Provider,
      {
        value: { isActive: false, startTour: vi.fn(), openSectionPicker },
      },
      createElement(PreferencesTab, {
        role,
        userId: 'user-1',
        accessToken: 'token',
      })
    )
  );
  return openSectionPicker;
}

describe('PreferencesTab - Tutorial', () => {
  it('lets a customer replay the tutorial', async () => {
    const user = userEvent.setup();
    const openSectionPicker = renderTab('customer');

    await user.click(screen.getByRole('button', { name: 'Replay tutorial' }));

    expect(openSectionPicker).toHaveBeenCalledTimes(1);
  });

  it('does not show the tutorial panel to staff', () => {
    renderTab('staff');

    expect(
      screen.queryByRole('button', { name: 'Replay tutorial' })
    ).not.toBeInTheDocument();
  });
});
