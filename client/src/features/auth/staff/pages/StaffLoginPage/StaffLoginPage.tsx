import { Link } from 'react-router';
import { StaffLoginForm } from '../../components/forms/StaffLoginForm/StaffLoginForm';
import styles from './StaffLoginPage.module.css';

export function StaffLoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="staff-login-title">
        <div>
          <h1 className={styles.title} id="staff-login-title">
            Staff Login
          </h1>
          <p className={styles.copy}>Sign in to continue to Golden Fur MIS.</p>
        </div>
        <StaffLoginForm />
        <Link className={styles.switchLink} to="/login">
          Customer? Sign in here
        </Link>
      </section>
    </main>
  );
}
