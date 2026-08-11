import { Link } from 'react-router';
import { LandingNavbar } from '../LandingPage/components/LandingNavbar/LandingNavbar';
import styles from './BranchesPage.module.css';

interface BranchInfo {
  name: string;
  // Full street address used for the "Get Directions" link — replace these
  // placeholders with each branch's real, complete address.
  address: string;
}

const BRANCHES: BranchInfo[] = [
  {
    name: 'Makati',
    address: 'Golden Fur Pet Care, Makati, Metro Manila, Philippines',
  },
  {
    name: 'Southwoods, Laguna',
    address: 'Golden Fur Pet Care, Southwoods, Laguna, Philippines',
  },
];

function getDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    address
  )}`;
}

export function BranchesPage() {
  return (
    <>
      <LandingNavbar />
      <main className={styles.page}>
        <h1 className={styles.title}>Branches</h1>
        <p className={styles.copy}>
          Visit us at any of our branches below — tap "Get Directions" to open
          turn-by-turn directions in Google Maps.
        </p>

        <div className={styles.branchList}>
          {BRANCHES.map((branch) => (
            <article key={branch.name} className={styles.branchCard}>
              <h2 className={styles.branchName}>📍 {branch.name}</h2>
              <p className={styles.branchAddress}>{branch.address}</p>
              <a
                href={getDirectionsUrl(branch.address)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.directionsLink}
              >
                Get Directions
              </a>
            </article>
          ))}
        </div>

        <Link to="/" className={styles.link}>
          Back to home
        </Link>
      </main>
    </>
  );
}
