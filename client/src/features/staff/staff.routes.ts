import { createElement, Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { StaffDashboardPage } from './dashboards/pages/StaffDashboardPage/StaffDashboardPage';
import { AdminCustomerListPage } from './pages/AdminCustomerListPage/AdminCustomerListPage';
import { AdminStaffListPage } from './pages/AdminStaffListPage/AdminStaffListPage';
import { StaffProfilePage } from './pages/StaffProfilePage/StaffProfilePage';
import { UnavailabilityApprovalQueuePage } from './pages/UnavailabilityApprovalQueuePage/UnavailabilityApprovalQueuePage';

export const staffRoutes = createElement(
  Fragment,
  null,
  createElement(
    Route,
    { element: createElement(StaffAuthGuard) },
    createElement(Route, {
      path: '/staff/dashboard',
      element: createElement(StaffDashboardPage),
    }),
    createElement(Route, {
      path: '/staff/dashboard/:roleSlug',
      element: createElement(StaffDashboardPage),
    }),
    createElement(Route, {
      path: '/staff/profile',
      element: createElement(StaffProfilePage),
    }),
    createElement(Route, {
      path: '/staff/admin/staff',
      element: createElement(AdminStaffListPage),
    }),
    createElement(Route, {
      path: '/staff/admin/unavailability',
      element: createElement(UnavailabilityApprovalQueuePage),
    }),
    createElement(Route, {
      path: '/staff/admin/customers',
      element: createElement(AdminCustomerListPage),
    })
  )
);
