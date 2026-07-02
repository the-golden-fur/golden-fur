import { CustomerLoginForm } from '../../components/forms/CustomerLoginForm/CustomerLoginForm';
import styles from './CustomerLoginPage.module.css';

export function CustomerLoginPage() {
  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="customer-login-title">
        <h1 className={styles.title} id="customer-login-title">
          Welcome back
        </h1>
        <p className={styles.copy}>
          Sign in to continue to your customer portal.
        </p>
        <CustomerLoginForm />
      </section>
    </main>
  );
}
