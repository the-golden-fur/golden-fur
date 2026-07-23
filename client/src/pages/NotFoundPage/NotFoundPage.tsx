import { Link } from 'react-router';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  return (
    <main className={styles.page}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.copy}>
        The page you're looking for doesn't exist or may have moved.
      </p>
      <Link to="/" className={styles.link}>
        Back to home
      </Link>
    </main>
  );
}
