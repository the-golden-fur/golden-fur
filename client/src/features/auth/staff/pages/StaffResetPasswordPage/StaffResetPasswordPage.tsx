import { StaffResetPasswordForm } from '../../components/forms/StaffResetPasswordForm/StaffResetPasswordForm';
import styles from './StaffResetPasswordPage.module.css';

export function StaffResetPasswordPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="staff-reset-title">
        <h1 id="staff-reset-title">Reset your password</h1>
        <p className={styles.sub}>Choose a new password to sign back in.</p>
        <StaffResetPasswordForm />
      </section>
    </main>
  );
}
