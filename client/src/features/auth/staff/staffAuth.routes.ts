import { createElement, Fragment } from 'react';
import { Link, Route } from 'react-router';
import { MfaChallengePage } from './pages/MfaChallengePage/MfaChallengePage';
import { MfaEnrollPage } from './pages/MfaEnrollPage/MfaEnrollPage';
import { StaffLoginPage } from './pages/StaffLoginPage/StaffLoginPage';
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
  createElement(
    Route,
    { element: createElement(StaffAuthGuard) },
    createElement(Route, {
      path: '/staff',
      element: createElement(
        'div',
        null,
        createElement('p', null, 'Staff dashboard'),
        createElement(
          'ul',
          null,
          createElement(
            'li',
            null,
            createElement(Link, { to: '/staff/profile' }, 'My Profile')
          ),
          createElement(
            'li',
            null,
            createElement(Link, { to: '/staff/settings' }, 'Settings')
          ),
          createElement(
            'li',
            null,
            createElement(Link, { to: '/staff/admin/staff' }, 'Staff Directory')
          )
        )
      ),
    }),
    createElement(Route, {
      path: '/staff/settings',
      element: createElement(SettingsPage, { role: 'staff' }),
    })
  )
);
