import { useEffect, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getCustomerProfile } from '../../api/customer.api';
import styles from './CustomerPortalPage.module.css';

/**
 * The customer portal home (`/portal`, the Navbar brand link's destination)
 * - previously a tile grid linking to Book a Service/My Bookings/Pet
 * Manager/Settings, now redundant with the Sidebar (AppShell), which
 * already links to all of those (customerPortal.config.ts). This page is
 * just a welcome landing message now.
 */
export function CustomerPortalPage() {
  const { user, accessToken } = useAuth();
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !accessToken) {
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
  }, [user?.id, accessToken]);

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>
        Welcome back{fullName ? `, ${fullName}` : ''}!
      </h1>
      <p className={styles.copy}>Find everything you need in the sidebar.</p>
    </main>
  );
}
