import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as featureFlagsApi from '../../../shared/api/featureFlags.api';
import { FeatureFlagsProvider } from '../../../shared/providers/FeatureFlagsProvider/FeatureFlagsProvider';
import { useFeatureFlag } from '../../../shared/providers/FeatureFlagsProvider/FeatureFlagsContext';
import { ExperimentalTab } from './ExperimentalTab';

vi.mock('../../../shared/api/featureFlags.api', async (importOriginal) => ({
  ...(await importOriginal<typeof featureFlagsApi>()),
  getFeatureFlags: vi.fn(),
  setFeatureFlag: vi.fn(),
}));

/** Shows what the rest of the app sees, to prove a toggle reaches it. */
function SpinWheelProbe() {
  return <p>spin wheel: {useFeatureFlag('spin_wheel') ? 'on' : 'off'}</p>;
}

function renderTab() {
  return render(
    <FeatureFlagsProvider>
      <ExperimentalTab accessToken="token" />
      <SpinWheelProbe />
    </FeatureFlagsProvider>
  );
}

describe('ExperimentalTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(featureFlagsApi.getFeatureFlags).mockResolvedValue({
      data: { spin_wheel: false },
      error: null,
    });
  });

  it('shows the coupon spin wheel switched off by default', async () => {
    renderTab();

    const toggle = await screen.findByRole('switch', {
      name: 'Coupon spin wheel',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('spin wheel: off')).toBeInTheDocument();
  });

  it('turning it on saves it and updates the rest of the app', async () => {
    vi.mocked(featureFlagsApi.setFeatureFlag).mockResolvedValue({
      data: { spin_wheel: true },
      error: null,
    });
    renderTab();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('switch', { name: 'Coupon spin wheel' })
    );

    expect(featureFlagsApi.setFeatureFlag).toHaveBeenCalledWith(
      'token',
      'spin_wheel',
      true
    );
    await waitFor(() =>
      expect(screen.getByText('spin wheel: on')).toBeInTheDocument()
    );
  });

  it('puts the switch back and says why when saving fails', async () => {
    vi.mocked(featureFlagsApi.setFeatureFlag).mockResolvedValue({
      data: null,
      error: 'Forbidden',
    });
    renderTab();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('switch', { name: 'Coupon spin wheel' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
    expect(
      screen.getByRole('switch', { name: 'Coupon spin wheel' })
    ).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('spin wheel: off')).toBeInTheDocument();
  });
});
