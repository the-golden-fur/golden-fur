import { Link } from 'react-router';
import { PawWatermark } from '../../../../../shared/components/PawWatermark/PawWatermark';
import { StaffLoginForm } from '../../components/forms/StaffLoginForm/StaffLoginForm';
import styles from './StaffLoginPage.module.css';

const heroFeatures = [
  { icon: '📅', label: 'Manage appointments across the clinic' },
  { icon: '🩺', label: 'Update patient medical records' },
  { icon: '💊', label: 'Track prescriptions and vaccinations' },
  { icon: '👥', label: 'Coordinate with your care team' },
];

export function StaffLoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.left}>
        <PawWatermark className={`${styles.paw} ${styles.p1}`} />
        <PawWatermark className={`${styles.paw} ${styles.p2}`} />
        <PawWatermark className={`${styles.paw} ${styles.p3}`} />

        <Link className={styles.logo} to="/">
          Golden Fur
        </Link>

        <div className={styles.hero}>
          <h2>Run the clinic, all in one place.</h2>
          <p>
            Sign in to manage appointments, patient records, and daily
            operations across Golden Fur.
          </p>
        </div>

        <div className={styles.features}>
          {heroFeatures.map(({ icon, label }) => (
            <div className={styles.feature} key={label}>
              <span className={styles.icon}>{icon}</span>
              <span className={styles.label}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.right}>
        <section className={styles.card} aria-labelledby="staff-login-title">
          <h1 id="staff-login-title">Staff Login</h1>
          <p className={styles.sub}>Sign in to continue to Golden Fur MIS.</p>
          <StaffLoginForm />
        </section>

        <p className={styles.customerLink}>
          Booking an appointment for your pet?{' '}
          <Link to="/login">Customer sign in</Link> or{' '}
          <Link to="/signup">create an account</Link>.
        </p>
      </div>
    </main>
  );
}
