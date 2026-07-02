import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../../providers/AuthProvider/useAuth';

export function CustomerAuthGuard() {
  const { user, session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return null;
  }

  if (!session || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
