import { Navigate, Route, Routes } from 'react-router';
import { customerAuthRoutes } from './features/auth/customer/customerAuth.routes';
import { staffAuthRoutes } from './features/auth/staff/staffAuth.routes';

export function AppRoutes() {
  return (
    <Routes>
      {staffAuthRoutes}
      {customerAuthRoutes}
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
