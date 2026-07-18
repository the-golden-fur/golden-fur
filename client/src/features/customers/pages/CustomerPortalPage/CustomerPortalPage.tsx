import { Link } from 'react-router';
import styles from './CustomerPortalPage.module.css';

interface PortalTileConfig {
  title: string;
  description: string;
  to: string;
}

const PORTAL_TILES: PortalTileConfig[] = [
  {
    title: 'Book a Service',
    description: 'Grooming, Pet Hotel, Daycare, or a Veterinary consultation.',
    to: '/portal/book',
  },
  {
    title: 'My Bookings',
    description: 'View upcoming and past bookings, reschedule, or cancel.',
    to: '/portal/bookings',
  },
  {
    title: 'My Profile',
    description: 'Your account details and pet profiles.',
    to: '/portal/profile',
  },
];

/**
 * The customer portal home (`/portal`, the Navbar brand link's destination)
 * - previously an inline placeholder `<div>Customer portal</div>` with no
 * links anywhere to the booking flow (#55-#60) once it shipped. Kept
 * deliberately simple (a static tile list, not a role-config system like
 * the staff dashboard) since every customer sees the same three
 * destinations.
 */
export function CustomerPortalPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Welcome to Golden Fur</h1>
      <div className={styles.grid}>
        {PORTAL_TILES.map((tile) => (
          <Link key={tile.title} to={tile.to} className={styles.tile}>
            <h2 className={styles.tileTitle}>{tile.title}</h2>
            <p className={styles.tileDescription}>{tile.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
