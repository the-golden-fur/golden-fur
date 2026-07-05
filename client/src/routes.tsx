import { Route, Routes } from 'react-router';
import { customerAuthRoutes } from './features/auth/customer/customerAuth.routes';
import { staffAuthRoutes } from './features/auth/staff/staffAuth.routes';
import LandingPage from './pages/LandingPage/LandingPage';

export function AppRoutes() {
  return (
    <Routes>
      {staffAuthRoutes}
      {customerAuthRoutes}
      <Route path="/" element={<LandingPage />} />
    </Routes>
  );
}
