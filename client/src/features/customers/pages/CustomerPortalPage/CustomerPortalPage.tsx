import { useEffect, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { CustomerPortalWidgets } from '../../components/CustomerPortalWidgets/CustomerPortalWidgets';
import { SlotConflictModal } from '../../components/SlotConflictModal/SlotConflictModal';
import { getCustomerProfile } from '../../api/customer.api';
import { listMyConflictedBookings } from '../../../booking/api/booking.api';
import type { ConflictedBooking } from '../../../booking/booking.types';
import styles from './CustomerPortalPage.module.css';

/**
 * The customer portal home (`/portal`, the Navbar brand link's destination).
 * Under the welcome message it shows the portal dashboard: a notification
 * board plus a 2x2 grid of My Pets / Book a Service / View Transactions /
 * Account Credit tiles, each linking out to its dedicated page.
 */
export function CustomerPortalPage() {
  const { user, accessToken } = useAuth();
  const [fullName, setFullName] = useState<string | null>(null);
  // Slot-conflict notification: fetched once on landing here (the dashboard)
  // so the popup fires immediately, per the request - "prompted immediately
  // when I open into my dashboard." Empty array = nothing to show;
  // SlotConflictModal itself no-ops when its list is empty.
  const [conflictedBookings, setConflictedBookings] = useState<
    ConflictedBooking[]
  >([]);

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

    void listMyConflictedBookings(accessToken).then((result) => {
      if (isMounted && result.data) {
        setConflictedBookings(result.data);
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

      <p className={styles.copy}>
        Here&apos;s a quick look at your account. More is in the sidebar.
      </p>

      {user?.id && accessToken ? (
        <CustomerPortalWidgets customerId={user.id} accessToken={accessToken} />
      ) : null}

      <SlotConflictModal
        bookings={conflictedBookings}
        onClose={() => setConflictedBookings([])}
      />
    </main>
  );
}
