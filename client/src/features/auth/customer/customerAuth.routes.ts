import { createElement, Fragment } from 'react';
import { Route } from 'react-router';
import { CustomerAuthGuard } from './guards/CustomerAuthGuard/CustomerAuthGuard';
import { CustomerLoginPage } from './pages/CustomerLoginPage/CustomerLoginPage';
import { CustomerSignupPage } from './pages/CustomerSignupPage/CustomerSignupPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage/OAuthCallbackPage';
import { CustomerMfaChallengePage } from './pages/CustomerMfaChallengePage/CustomerMfaChallengePage';
import { SettingsPage } from '../../../pages/SettingsPage/SettingsPage';
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
    })
  )
);
