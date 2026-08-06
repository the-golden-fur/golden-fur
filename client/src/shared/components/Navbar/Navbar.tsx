import { useState, type ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../auth/providers/AuthProvider/useAuth';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import styles from './Navbar.module.css';

export interface NavbarIdentity {
  /** Staff: username. Customer: full name (customers have no username/role). */
  primary: string;
  /** Staff role label - omitted for customers. */
  secondary?: string;
}

interface NavbarProps {
  role: ThemeRole;
  brandLabel: string;
  /** null while the profile fetch that supplies it is still in flight. */
  identity?: NavbarIdentity | null;
  /** Issue #100: staff-only NotificationBell, rendered by StaffAuthGuard -
   * the customer portal gets a sidebar tab instead (#101), not a bell. */
  notificationBell?: ReactNode;
}

const HOME_PATH_BY_ROLE: Record<ThemeRole, string> = {
  staff: '/staff',
  customer: '/portal',
};

const SETTINGS_PATH_BY_ROLE: Record<ThemeRole, string> = {
  staff: '/staff/settings',
  customer: '/portal/settings',
};

const LOGIN_PATH_BY_ROLE: Record<ThemeRole, string> = {
  staff: '/staff/login',
  customer: '/login',
};

/**
 * Persistent top bar for the authenticated staff/customer areas - rendered
 * once by AppShell (StaffAuthGuard/CustomerAuthGuard) rather than duplicated
 * per page. Navigation itself lives in the Sidebar now. The identity chip is
 * a plain (non-interactive) display of who's signed in - Settings gets its
 * own explicit icon button instead of being an undiscoverable side effect of
 * clicking the username. Sign out stays a dedicated button (not folded into
 * Settings) since it's an account-wide action, not a setting.
 */
export function Navbar({
  role,
  brandLabel,
  identity,
  notificationBell,
}: NavbarProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    window.sessionStorage.removeItem('staffMfaPending');
    window.sessionStorage.removeItem('customerMfaPending');
    navigate(LOGIN_PATH_BY_ROLE[role], { replace: true });
  };

  return (
    <nav className={styles.navbar} aria-label="Primary">
      <Link to={HOME_PATH_BY_ROLE[role]} className={styles.brand}>
        {brandLabel}
      </Link>

      <button
        type="button"
        className={styles.menuToggle}
        aria-expanded={isMenuOpen}
        aria-controls="primary-nav-links"
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        Menu
      </button>

      <div
        id="primary-nav-links"
        className={isMenuOpen ? styles.linksOpen : styles.links}
      >
        {identity ? (
          <div className={styles.identity}>
            <span className={styles.identityPrimary}>{identity.primary}</span>
            {identity.secondary ? (
              <span className={styles.identitySecondary}>
                {identity.secondary}
              </span>
            ) : null}
          </div>
        ) : null}
        {notificationBell}
        <Link
          to={SETTINGS_PATH_BY_ROLE[role]}
          className={styles.settingsLink}
          aria-label="Settings"
          onClick={() => setIsMenuOpen(false)}
        >
          <Settings size={18} aria-hidden="true" />
          <span className={styles.settingsLabel}>Settings</span>
        </Link>
        <button
          type="button"
          className={styles.signOutButton}
          disabled={isSigningOut}
          onClick={() => void handleSignOut()}
        >
          {isSigningOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </nav>
  );
}
