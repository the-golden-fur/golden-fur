import { useAuth } from '../../../providers/AuthProvider/useAuth';
import styles from './CustomerPortalPage.module.css';

export function CustomerPortalPage() {
  const { user, signOut } = useAuth();
  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ?? user?.email;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Golden Fur</p>
          <h1 className={styles.title}>Welcome{fullName ? `, ${fullName}` : ''}</h1>
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
          Your bookings, pets, and account details will appear here.
        </p>
      </section>
    </main>
  );
}
