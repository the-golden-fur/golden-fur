import { Link } from 'react-router';
import { LandingNavbar } from '../LandingPage/components/LandingNavbar/LandingNavbar';
import { HelpMascot } from '../../shared/components/HelpMascot/HelpMascot';
import styles from './AboutPage.module.css';

export function AboutPage() {
  return (
    <>
      <LandingNavbar />
      <main className={styles.page}>
        <h1 className={styles.title}>About</h1>
        <p className={styles.copy}>
          Placeholder content — replace with the About page design (our story,
          mission, team, etc.).
        </p>
        <Link to="/" className={styles.link}>
          Back to home
        </Link>
      </main>

      <HelpMascot
        links={[
          { label: 'Create an account', href: '#' },
          { label: 'Create a ticket', href: '#' },
        ]}
      />
    </>
  );
}
