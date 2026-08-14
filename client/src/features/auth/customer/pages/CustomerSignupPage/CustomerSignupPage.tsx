import { Link } from 'react-router';
import { PawWatermark } from '../../../../../shared/components/PawWatermark/PawWatermark';
import { CustomerSignupForm } from '../../components/forms/CustomerSignupForm/CustomerSignupForm';
import styles from './CustomerSignupPage.module.css';

const heroFeatures = [
  { icon: '📅', label: 'Book and manage appointments online' },
  { icon: '📋', label: 'Access medical records anytime' },
  { icon: '💉', label: 'Track prescription and vaccination history' },
  { icon: '💬', label: 'Message your vet directly' },
];

export function CustomerSignupPage() {
  return (
    <main className={styles.page}>
      <div className={styles.left}>
        <PawWatermark className={`${styles.paw} ${styles.p1}`} />
        <PawWatermark className={`${styles.paw} ${styles.p2}`} />
        <PawWatermark className={`${styles.paw} ${styles.p3}`} />

        <div className={styles.logo}>Golden Fur</div>

        <div className={styles.hero}>
          <h2>
            Your pet&apos;s health,
            <br />
            <em>always golden</em>
          </h2>
          <p>
            Sign in to manage appointments, access health records, and stay
            connected with your vet — all in one place.
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
        <nav className={styles.tabs} aria-label="Customer authentication">
          <Link className={`${styles.tab} ${styles.tabMuted}`} to="/login">
            Sign In
          </Link>
          <span
            className={`${styles.tab} ${styles.tabActive}`}
            aria-current="page"
          >
            Create Account
          </span>
        </nav>

        <section
          className={styles.card}
          aria-labelledby="customer-signup-title"
        >
          <h1 id="customer-signup-title">Create Account</h1>
          <p className={styles.sub}>Welcome to Golden Fur</p>
          <CustomerSignupForm />
        </section>

        <Link className={styles.staffLink} to="/staff/login">
          Staff sign in
        </Link>
      </div>
    </main>
  );
}
