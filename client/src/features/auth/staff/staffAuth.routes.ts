import type { RouteObject } from 'react-router';
import { StaffLoginPage } from './pages/StaffLoginPage/StaffLoginPage';
import { MfaEnrollPage } from './pages/MfaEnrollPage/MfaEnrollPage';
import { MfaChallengePage } from './pages/MfaChallengePage/MfaChallengePage';

export const staffAuthRoutes: RouteObject[] = [
  { path: '/staff/login', element: <StaffLoginPage /> },
  { path: '/staff/mfa/enroll', element: <MfaEnrollPage /> },
  { path: '/staff/mfa/verify', element: <MfaChallengePage /> },
  { path: '/staff/forgot-password', element: <StaffLoginPage /> },
];
