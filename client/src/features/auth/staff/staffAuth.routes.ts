import { createElement, Fragment } from 'react';
import { Route } from 'react-router';
import { MfaChallengePage } from './pages/MfaChallengePage/MfaChallengePage';
import { MfaEnrollPage } from './pages/MfaEnrollPage/MfaEnrollPage';
import { StaffDashboardPage } from './pages/StaffDashboardPage/StaffDashboardPage';
import { StaffLoginPage } from './pages/StaffLoginPage/StaffLoginPage';
import { StaffAuthGuard } from './guards/StaffAuthGuard/StaffAuthGuard';

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
  createElement(
    Route,
    { element: createElement(StaffAuthGuard) },
    createElement(Route, {
      path: '/staff',
      element: createElement(StaffDashboardPage),
    })
  )
);
