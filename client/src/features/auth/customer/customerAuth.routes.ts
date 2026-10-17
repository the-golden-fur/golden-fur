import { createElement, Fragment } from 'react';
import { Route } from 'react-router';
import { CustomerAuthGuard } from './guards/CustomerAuthGuard/CustomerAuthGuard';
import { CustomerLoginPage } from './pages/CustomerLoginPage/CustomerLoginPage';
import { CustomerSignupPage } from './pages/CustomerSignupPage/CustomerSignupPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage/OAuthCallbackPage';
import { CustomerMfaChallengePage } from './pages/CustomerMfaChallengePage/CustomerMfaChallengePage';
import { DeactivatedAccountNoticePage } from './pages/DeactivatedAccountNoticePage/DeactivatedAccountNoticePage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage/ResetPasswordPage';
import { SettingsPage } from '../../../pages/SettingsPage/SettingsPage';
import { NotificationsPage } from '../../../pages/NotificationsPage/NotificationsPage';
import { CustomerPortalPage } from '../../customers/pages/CustomerPortalPage/CustomerPortalPage';

export const customerAuthRoutes = createElement(
  Fragment,
  null,
  createElement(Route, {
    path: '/login',
    element: createElement(CustomerLoginPage),
  }),
  createElement(Route, {
    path: '/signup',
    element: createElement(CustomerSignupPage),
  }),
  createElement(Route, {
    path: '/auth/callback',
    element: createElement(OAuthCallbackPage),
  }),
  createElement(Route, {
    path: '/portal/mfa/verify',
    element: createElement(CustomerMfaChallengePage),
  }),
  createElement(Route, {
    path: '/account-deactivated',
    element: createElement(DeactivatedAccountNoticePage),
  }),
  createElement(Route, {
    path: '/forgot-password',
    element: createElement(ForgotPasswordPage),
  }),
  createElement(Route, {
    path: '/reset-password',
    element: createElement(ResetPasswordPage),
  }),
  createElement(
    Route,
    { element: createElement(CustomerAuthGuard) },
    createElement(Route, {
      path: '/portal',
      element: createElement(CustomerPortalPage),
    }),
    createElement(Route, {
      path: '/portal/settings',
      element: createElement(SettingsPage, { role: 'customer' }),
    }),
    createElement(Route, {
      path: '/portal/notifications',
      element: createElement(NotificationsPage),
    })
  )
);
