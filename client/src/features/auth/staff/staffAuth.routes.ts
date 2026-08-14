import { createElement, Fragment } from 'react';
import { Navigate, Route } from 'react-router';
import { MfaChallengePage } from './pages/MfaChallengePage/MfaChallengePage';
import { MfaEnrollPage } from './pages/MfaEnrollPage/MfaEnrollPage';
import { StaffLoginPage } from './pages/StaffLoginPage/StaffLoginPage';
import { StaffResetPasswordPage } from './pages/StaffResetPasswordPage/StaffResetPasswordPage';
import { StaffAuthGuard } from './guards/StaffAuthGuard/StaffAuthGuard';
import { SettingsPage } from '../../../pages/SettingsPage/SettingsPage';
import { NotificationsPage } from '../../../pages/NotificationsPage/NotificationsPage';

export const staffAuthRoutes = createElement(
  Fragment,
  null,
  createElement(Route, {
    path: '/staff/login',
    element: createElement(StaffLoginPage),
  }),
  createElement(Route, {
    path: '/staff/mfa/enroll',
    element: createElement(MfaEnrollPage),
  }),
  createElement(Route, {
    path: '/staff/mfa/verify',
    element: createElement(MfaChallengePage),
  }),
  createElement(Route, {
    path: '/staff/reset-password',
    element: createElement(StaffResetPasswordPage),
  }),
  createElement(
    Route,
    { element: createElement(StaffAuthGuard) },
    createElement(Route, {
      path: '/staff',
      element: createElement(Navigate, {
        to: '/staff/dashboard',
        replace: true,
      }),
    }),
    createElement(Route, {
      path: '/staff/settings',
      element: createElement(SettingsPage, { role: 'staff' }),
    }),
    createElement(Route, {
      path: '/staff/notifications',
      element: createElement(NotificationsPage),
    }),
    createElement(Route, {
      // Custom change (Gmail-style messaging redesign): retired in favor of
      // the ComposeModal (navbar mail icon) - redirect rather than a bare
      // 404 for anyone with this URL bookmarked, mirroring the /staff ->
      // /staff/dashboard redirect above.
      path: '/staff/notifications/new',
      element: createElement(Navigate, {
        to: '/staff/notifications',
        replace: true,
      }),
    })
  )
);
