import { CustomerSignupForm } from '../../components/forms/CustomerSignupForm/CustomerSignupForm';
import styles from './CustomerSignupPage.module.css';

export function CustomerSignupPage() {
  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="customer-signup-title">
        <h1 className={styles.title} id="customer-signup-title">
          Create your account
        </h1>
        <p className={styles.copy}>
          Join Golden Fur to access the customer portal.
        </p>
        <CustomerSignupForm />
      </section>
    </main>
  );
}
