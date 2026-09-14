import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as notificationsApi from '../../api/notifications.api';
import type { Notification } from '../../notifications.types';
import { NotificationBell } from './NotificationBell';

vi.mock('../../api/notifications.api', () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn().mockResolvedValue({ data: null, error: null }),
  markAllNotificationsRead: vi
    .fn()
    .mockResolvedValue({ data: null, error: null }),
}));

function buildNotification(
  overrides: Partial<Notification> = {}
): Notification {
  return {
    id: 'n-1',
    recipient_staff_id: null,
    recipient_customer_id: 'cust-1',
    event_type: 'booking_slot_conflict',
    title: 'Your booking slot is no longer available',
    message: 'Your Grooming booking is no longer available.',
    related_booking_id: 'booking-1',
    related_thread_id: null,
    is_read: false,
    is_starred: false,
    is_deleted: false,
    created_at: '2026-09-11T00:00:00.000Z',
    ...overrides,
  };
}

function renderBell(notificationsHref: string) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/start'] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/start',
          element: createElement(NotificationBell, {
            accessToken: 'token',
            notificationsHref,
          }),
        }),
        createElement(Route, {
          path: '/portal/bookings',
          element: createElement('main', null, 'My bookings page'),
        }),
        createElement(Route, {
          path: '/staff/bookings/:id',
          element: createElement('main', null, 'Staff booking details page'),
        })
      )
    )
  );
}

/**
 * Slot-conflict notification: covers the previously-dead
 * `related_booking_id` link - clicking a notification that carries one now
 * navigates to the booking, on top of the pre-existing mark-as-read
 * behavior. Role (staff vs. customer) is read off notificationsHref, the
 * same prop StaffAuthGuard/CustomerAuthGuard already pass.
 */
describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('customer: clicking a notification with a related booking marks it read and navigates to /portal/bookings?open=<id>', async () => {
    const user = userEvent.setup();
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue({
      data: [buildNotification()],
      error: null,
    });

    renderBell('/portal/notifications');

    await user.click(
      await screen.findByRole('button', { name: /notifications/i })
    );
    await user.click(
      await screen.findByText('Your booking slot is no longer available')
    );

    await waitFor(() =>
      expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith(
        'n-1',
        'token'
      )
    );
    expect(await screen.findByText('My bookings page')).toBeInTheDocument();
  });

  it('staff: navigates to /staff/bookings/<id> instead', async () => {
    const user = userEvent.setup();
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue({
      data: [
        buildNotification({
          recipient_staff_id: 'staff-1',
          recipient_customer_id: null,
          event_type: 'staff_assigned',
          title: 'You were selected as preferred staff',
        }),
      ],
      error: null,
    });

    renderBell('/staff/notifications');

    await user.click(
      await screen.findByRole('button', { name: /notifications/i })
    );
    await user.click(
      await screen.findByText('You were selected as preferred staff')
    );

    expect(
      await screen.findByText('Staff booking details page')
    ).toBeInTheDocument();
  });

  it('does not navigate when the notification has no related booking', async () => {
    const user = userEvent.setup();
    vi.mocked(notificationsApi.listNotifications).mockResolvedValue({
      data: [
        buildNotification({
          related_booking_id: null,
          event_type: 'password_reset',
          title: 'Password reset requested',
        }),
      ],
      error: null,
    });

    renderBell('/portal/notifications');

    await user.click(
      await screen.findByRole('button', { name: /notifications/i })
    );
    await user.click(await screen.findByText('Password reset requested'));

    await waitFor(() =>
      expect(notificationsApi.markNotificationRead).toHaveBeenCalled()
    );
    expect(screen.queryByText('My bookings page')).not.toBeInTheDocument();
  });
});
