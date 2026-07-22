import { Link } from 'react-router';
import styles from './ServerErrorPage.module.css';

export function ServerErrorPage() {
  return (
    <main className={styles.page}>
      <p className={styles.code}>500</p>
      <h1 className={styles.title}>Something went wrong</h1>
      <p className={styles.copy}>
        An unexpected error occurred on our end. Please try again in a
        moment.
      </p>
      <p className={styles.errorCode} role="alert">
        Error code: SERVER_ERROR
      </p>
      <Link to="/" className={styles.link}>
        Back to home
      </Link>
    </main>
  );
}
