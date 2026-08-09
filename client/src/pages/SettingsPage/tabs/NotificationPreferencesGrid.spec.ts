import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as preferencesApi from '../../../shared/api/preferences.api';
import { NotificationPreferencesGrid } from './NotificationPreferencesGrid';

vi.mock('../../../shared/api/preferences.api', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../shared/api/preferences.api')
    >();
  return {
    ...actual,
    getNotificationPreferences: vi.fn(),
    updateNotificationPreference: vi.fn(),
    updateReminderOffset: vi.fn(),
  };
});

function renderGrid(role: 'customer' | 'staff' = 'customer') {
  return render(
    createElement(NotificationPreferencesGrid, {
      role,
      userId: 'user-1',
      accessToken: 'token',
    })
  );
}

describe('NotificationPreferencesGrid - reminder offset (customer only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the reminder-timing dropdown for a customer, defaulting to 1 day before', async () => {
    vi.mocked(preferencesApi.getNotificationPreferences).mockResolvedValue({
      appointment_reminder: { email: true, in_browser: true },
    } as never);

    renderGrid('customer');

    const select = await screen.findByLabelText(
      'When to send the booking reminder'
    );
    expect(select).toHaveValue('1440');
  });

  it('does not show the reminder-timing dropdown for staff (no appointment_reminder event)', async () => {
    vi.mocked(preferencesApi.getNotificationPreferences).mockResolvedValue(
      {} as never
    );

    renderGrid('staff');

    await waitFor(() =>
      expect(screen.getByText('Account created')).toBeInTheDocument()
    );
    expect(
      screen.queryByLabelText('When to send the booking reminder')
    ).not.toBeInTheDocument();
  });

  it('persists a chosen offset and reverts it if the request fails', async () => {
    const user = userEvent.setup();
    vi.mocked(preferencesApi.getNotificationPreferences).mockResolvedValue({
      appointment_reminder: { email: true, in_browser: true },
    } as never);
    vi.mocked(preferencesApi.updateReminderOffset).mockResolvedValue({
      data: null,
      error: 'Request failed. Please try again.',
    });

    renderGrid('customer');

    const select = await screen.findByLabelText(
      'When to send the booking reminder'
    );
    await user.selectOptions(select, '60');

    expect(preferencesApi.updateReminderOffset).toHaveBeenCalledWith(
      'token',
      60
    );

    // The request failed, so the dropdown reverts to its previous value.
    await waitFor(() => expect(select).toHaveValue('1440'));
  });

  it('disables the reminder-timing dropdown once both channels are off, and re-enables it when either is switched back on', async () => {
    const user = userEvent.setup();
    vi.mocked(preferencesApi.getNotificationPreferences).mockResolvedValue({
      appointment_reminder: { email: true, in_browser: false },
    } as never);
    vi.mocked(preferencesApi.updateNotificationPreference).mockResolvedValue({
      data: {
        appointment_reminder: { email: false, in_browser: false },
      } as never,
      error: null,
    });

    renderGrid('customer');

    const select = await screen.findByLabelText(
      'When to send the booking reminder'
    );
    expect(select).toBeEnabled();

    await user.click(
      screen.getByLabelText('Email notifications for Booking reminder')
    );

    await waitFor(() => expect(select).toBeDisabled());
  });
});
