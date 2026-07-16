import { createElement, Fragment } from 'react';
import { Navigate, Route } from 'react-router';
import { MfaChallengePage } from './pages/MfaChallengePage/MfaChallengePage';
import { MfaEnrollPage } from './pages/MfaEnrollPage/MfaEnrollPage';
import { StaffLoginPage } from './pages/StaffLoginPage/StaffLoginPage';
import { StaffResetPasswordPage } from './pages/StaffResetPasswordPage/StaffResetPasswordPage';
import { StaffAuthGuard } from './guards/StaffAuthGuard/StaffAuthGuard';
import { SettingsPage } from '../../../pages/SettingsPage/SettingsPage';

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
    })
  )
);
