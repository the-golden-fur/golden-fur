import { useAuth } from '../../../providers/AuthProvider/useAuth';
import styles from './StaffDashboardPage.module.css';

export function StaffDashboardPage() {
  const { user, signOut } = useAuth();
  const role =
    (user?.app_metadata?.role as string | undefined) ??
    (user?.user_metadata?.role as string | undefined);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Golden Fur MIS</p>
          <h1 className={styles.title}>Staff Dashboard</h1>
          {role ? <p className={styles.role}>{role}</p> : null}
        </div>
        <button
          className={styles.signOutButton}
          type="button"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </header>
      <section className={styles.shell}>
        <p className={styles.copy}>
          Bookings, schedules, and branch tools will appear here.
        </p>
      </section>
    </main>
  );
}
