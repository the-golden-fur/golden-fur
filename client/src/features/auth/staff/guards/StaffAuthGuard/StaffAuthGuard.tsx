import { Navigate, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { useAuth } from '../../../providers/AuthProvider/useAuth';

interface StaffAuthGuardProps {
  children: ReactNode;
}

export function StaffAuthGuard({ children }: StaffAuthGuardProps) {
  const location = useLocation();
  const { accessToken, isLoading } = useAuth();
  const isAuthenticated = Boolean(accessToken);
  const isMfaPending = false;

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/staff/login" replace state={{ from: location }} />;
  }

  if (isMfaPending) {
    return <Navigate to="/staff/mfa/verify" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
