import { Route, Routes } from 'react-router';
import { customerAuthRoutes } from './features/auth/customer/customerAuth.routes';
import { staffAuthRoutes } from './features/auth/staff/staffAuth.routes';
import { staffRoutes } from './features/staff/staff.routes';
import { customerRoutes } from './features/customers/customer.routes';
import { maintenanceRoutes } from './features/maintenance/maintenance.routes';
import { discountsRoutes } from './features/discounts/discounts.routes';
import { bookingRoutes } from './features/booking/booking.routes';
import { groomingRoutes } from './features/grooming/grooming.routes';
import { daycareRoutes } from './features/daycare/daycare.routes';
import { veterinaryRoutes } from './features/veterinary/veterinary.routes';
import { hotelRoutes } from './features/hotel/hotel.routes';
import LandingPage from './pages/LandingPage/LandingPage';
import { BranchesPage } from './pages/BranchesPage/BranchesPage';
import { PackagesPromosPage } from './pages/PackagesPromosPage/PackagesPromosPage';
import { AboutPage } from './pages/AboutPage/AboutPage';
import { ServerErrorPage } from './pages/ServerErrorPage/ServerErrorPage';
import { NotFoundPage } from './pages/NotFoundPage/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      {staffAuthRoutes}
      {staffRoutes}
      {maintenanceRoutes}
      {discountsRoutes}
      {bookingRoutes}
      {groomingRoutes}
      {daycareRoutes}
      {veterinaryRoutes}
      {hotelRoutes}
      {customerAuthRoutes}
      {customerRoutes}
      <Route path="/" element={<LandingPage />} />
      <Route path="/branches" element={<BranchesPage />} />
      <Route path="/packages" element={<PackagesPromosPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/error" element={<ServerErrorPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
