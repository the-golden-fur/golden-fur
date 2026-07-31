import { createElement, Fragment } from 'react';
import { Route } from 'react-router';
import { StaffAuthGuard } from '../auth/staff/guards/StaffAuthGuard/StaffAuthGuard';
import { StaffDashboardPage } from './pages/StaffDashboardPage/StaffDashboardPage';
import { CustomerManagementPage } from './pages/CustomerManagementPage/CustomerManagementPage';
import { StaffManagementPage } from './pages/StaffManagementPage/StaffManagementPage';
import { StaffPetProfilePage } from './pages/StaffPetProfilePage/StaffPetProfilePage';
import { DaysOffPage } from './pages/DaysOffPage/DaysOffPage';
import { UnavailabilityApprovalQueuePage } from './pages/UnavailabilityApprovalQueuePage/UnavailabilityApprovalQueuePage';
import { AdminArchivePage } from './pages/AdminArchivePage/AdminArchivePage';

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
      path: '/staff/days-off',
      element: createElement(DaysOffPage),
    }),
    createElement(Route, {
      path: '/staff/admin/staff',
      element: createElement(StaffManagementPage),
    }),
    createElement(Route, {
      path: '/staff/admin/unavailability',
      element: createElement(UnavailabilityApprovalQueuePage),
    }),
    createElement(Route, {
      path: '/staff/admin/customers',
      element: createElement(CustomerManagementPage),
    }),
    createElement(Route, {
      path: '/staff/admin/archive',
      element: createElement(AdminArchivePage),
    }),
    createElement(Route, {
      path: '/staff/pets/:petId',
      element: createElement(StaffPetProfilePage),
    })
  )
);
