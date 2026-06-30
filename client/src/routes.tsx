import { Navigate, Route, Routes } from 'react-router';
import { staffAuthRoutes } from './features/auth/staff/staffAuth.routes';

export function AppRoutes() {
  return (
    <Routes>
      {staffAuthRoutes}
      <Route path="/" element={<Navigate to="/staff/login" replace />} />
    </Routes>
  );
}
