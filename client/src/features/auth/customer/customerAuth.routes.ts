import { createElement, Fragment } from 'react';
import { Route } from 'react-router';
import { CustomerAuthGuard } from './guards/CustomerAuthGuard/CustomerAuthGuard';
import { CustomerLoginPage } from './pages/CustomerLoginPage/CustomerLoginPage';
import { CustomerPortalPage } from './pages/CustomerPortalPage/CustomerPortalPage';
import { CustomerSignupPage } from './pages/CustomerSignupPage/CustomerSignupPage';
import { OAuthCallbackPage } from './pages/OAuthCallbackPage/OAuthCallbackPage';

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
  createElement(
    Route,
    { element: createElement(CustomerAuthGuard) },
    createElement(Route, {
      path: '/portal',
      element: createElement(CustomerPortalPage),
    })
  )
);
