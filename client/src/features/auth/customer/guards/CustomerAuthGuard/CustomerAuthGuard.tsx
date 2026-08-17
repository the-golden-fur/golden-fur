import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { AppShell } from '../../../../../shared/components/AppShell/AppShell';
import { useAuth } from '../../../../../shared/auth/providers/AuthProvider/useAuth';
import { getMfaStatus } from '../../../../../shared/api/mfa.api';
import { hasProfile } from '../../../../../shared/api/preferences.api';
import { getSessionAal } from '../../../../../shared/auth/api/auth.api';
import { getCustomerProfile } from '../../../../customers/api/customer.api';
import { CUSTOMER_SIDEBAR_SECTIONS } from '../../../../customers/config/customerPortal.config';
import { NotificationBell } from '../../../../notifications/components/NotificationBell/NotificationBell';
import { ComposeEntryPoint } from '../../../../messaging/components/ComposeEntryPoint/ComposeEntryPoint';

export function CustomerAuthGuard() {
  const { user, session, accessToken, isLoading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // null = not yet known. MFA is optional for customers, but once they've
  // turned it on it must be challenged on every login, not just offered at
  // setup time - mirrors StaffAuthGuard's status fetch.
  const [mfaEnrolled, setMfaEnrolled] = useState<boolean | null>(null);
  // Populated once profileStatus is 'ok', for the Navbar identity chip.
  // Customers have no username/role, unlike staff - just a full name.
  const [fullName, setFullName] = useState<string | null>(null);
  // 'loading' until the customer_profiles check resolves. Customers and
  // staff share the same Supabase Auth session, so a valid session alone
  // doesn't prove this user is actually a customer - only a matching
  // profile row does. 'denied' means it isn't one (e.g. a staff session
  // that reached /portal directly).
  const [profileStatus, setProfileStatus] = useState<
    'loading' | 'ok' | 'denied'
  >('loading');
  // Lifted out of ComposeEntryPoint (which normally owns it) so the
  // HelpMascot's "Contact support" link can open the same compose modal.
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  useEffect(() => {
    if (!session || !accessToken) {
      return;
    }

    let isMounted = true;

    void getMfaStatus('customer', accessToken).then((result) => {
      if (isMounted) {
        setMfaEnrolled(result.data?.mfa_enrolled ?? null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session, accessToken]);

  useEffect(() => {
    if (!session || !user?.id) {
      return;
    }

    let isMounted = true;

    void hasProfile('customer', user.id).then((exists) => {
      if (isMounted) {
        setProfileStatus(exists ? 'ok' : 'denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [session, user?.id]);

  useEffect(() => {
    if (profileStatus !== 'ok' || !accessToken || !user?.id) {
      return;
    }

    let isMounted = true;

    void getCustomerProfile(user.id, accessToken).then((result) => {
      if (isMounted && result.data) {
        setFullName(result.data.full_name);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [profileStatus, accessToken, user?.id]);

  const handleDenied = useCallback(() => {
    void signOut().finally(() => {
      navigate('/login', { replace: true });
    });
  }, [navigate, signOut]);

  useEffect(() => {
    if (profileStatus === 'denied') {
      handleDenied();
    }
  }, [profileStatus, handleDenied]);

  if (isLoading) {
    return null;
  }

  if (!session || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const aal = getSessionAal(session);
  const sessionFlagPending =
    window.sessionStorage.getItem('customerMfaPending') === 'true';

  // Honored immediately, independent of the profile/MFA-status fetches below.
  if (sessionFlagPending && location.pathname !== '/portal/mfa/verify') {
    return <Navigate to="/portal/mfa/verify" replace />;
  }

  if (profileStatus !== 'ok') {
    return null;
  }

  const needsAal2 = mfaEnrolled === true && aal !== 'aal2';

  if (needsAal2 && location.pathname !== '/portal/mfa/verify') {
    return <Navigate to="/portal/mfa/verify" replace />;
  }

  return (
    <AppShell
      role="customer"
      brandLabel="Golden Fur"
      identity={fullName ? { primary: fullName } : null}
      sidebarSections={CUSTOMER_SIDEBAR_SECTIONS}
      notificationBell={
        accessToken ? (
          <NotificationBell
            accessToken={accessToken}
            notificationsHref="/portal/notifications"
          />
        ) : null
      }
      composeButton={
        accessToken ? (
          <ComposeEntryPoint
            accessToken={accessToken}
            viewerRole={null}
            isOpen={isComposeOpen}
            onOpenChange={setIsComposeOpen}
          />
        ) : null
      }
      onContactSupport={accessToken ? () => setIsComposeOpen(true) : undefined}
    />
  );
}
