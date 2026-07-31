import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { MiscellaneousSaleForm } from '../../components/MiscellaneousSaleForm/MiscellaneousSaleForm';
import styles from './MiscellaneousSalePage.module.css';

/** Issue #87: reachable independently of the booking-checkout flow (e.g.
 * from a "New Miscellaneous Sale" action on the cashier dashboard) - a misc
 * sale by definition has no booking to check out from. Role enforcement is
 * server-side (BILLING_STAFF_ROLES on POST /billing/misc-sale); every staff
 * role that can reach /staff can open this page, matching
 * CashierCheckoutPage's own lack of a client-side role gate. */
export function MiscellaneousSalePage() {
  const { accessToken } = useAuth();

  if (!accessToken) {
    return <p>Loading...</p>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <MiscellaneousSaleForm accessToken={accessToken} />
      </div>
    </main>
  );
}
