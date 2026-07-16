import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../auth/providers/AuthProvider/useAuth';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import styles from './Navbar.module.css';

interface NavbarProps {
  role: ThemeRole;
  brandLabel: string;
}

const HOME_PATH_BY_ROLE: Record<ThemeRole, string> = {
  staff: '/staff',
  customer: '/portal',
};

const PROFILE_PATH_BY_ROLE: Record<ThemeRole, string> = {
  staff: '/staff/profile',
  customer: '/portal/profile',
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
 * once by StaffAuthGuard/CustomerAuthGuard rather than duplicated per page.
 * Sign out lives here (not on SettingsPage) since it's an account-wide
 * action, not a setting.
 */
export function Navbar({ role, brandLabel }: NavbarProps) {
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
        <Link
          to={PROFILE_PATH_BY_ROLE[role]}
          className={styles.link}
          onClick={() => setIsMenuOpen(false)}
        >
          My Profile
        </Link>
        <Link
          to={SETTINGS_PATH_BY_ROLE[role]}
          className={styles.link}
          onClick={() => setIsMenuOpen(false)}
        >
          Settings
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
