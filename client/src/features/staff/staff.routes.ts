import { createElement, Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { StaffProfilePage } from './pages/StaffProfilePage/StaffProfilePage';

export const staffRoutes = createElement(
  Fragment,
  null,
  createElement(
    Route,
    { element: createElement(StaffAuthGuard) },
    createElement(Route, {
      path: '/staff/profile',
      element: createElement(StaffProfilePage),
    })
  )
);
