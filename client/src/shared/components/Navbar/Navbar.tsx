import { useState, type ReactNode } from 'react';
import { Home, Settings } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
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
  /** NotificationBell, rendered by StaffAuthGuard/CustomerAuthGuard - both
   * roles get one, each pointed at their own /staff or /portal notifications
   * page via NotificationBell's notificationsHref prop. */
  notificationBell?: ReactNode;
  /** ComposeEntryPoint (mail/pencil icon), rendered next to notificationBell -
   * both roles get one, opening the New message modal directly. */
  composeButton?: ReactNode;
  /** CreditBalanceIndicator - customer-only (CustomerAuthGuard passes it,
   * StaffAuthGuard doesn't), so it's absent for staff. */
  creditIndicator?: ReactNode;
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
 *
 * Custom change (live-review): Home also gets its own icon button here -
 * neither the Sidebar (staff or customer) has its own Dashboard/Home tile
 * any more, so this is now the only dedicated way back to it (the brand
 * link at the far left already went to the same place, but wasn't visually
 * an affordance for "go home").
 */
export function Navbar({
  role,
  brandLabel,
  identity,
  notificationBell,
  composeButton,
  creditIndicator,
}: NavbarProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    window.sessionStorage.removeItem('staffMfaPending');
    window.sessionStorage.removeItem('customerMfaPending');
    navigate(LOGIN_PATH_BY_ROLE[role], { replace: true });
  };

  // Custom change (VSCode-style settings modal): while the Settings page
  // itself is open, the persistent Navbar swaps its usual dashboard
  // shortcuts (Home/Settings icons, identity chip, notifications, compose)
  // for a minimal "you're in Settings" bar - those shortcuts are redundant
  // once the modal's own header (title, sort, fullscreen, close) already
  // covers navigating around/out of it.
  const isSettingsRoute = location.pathname.startsWith(
    SETTINGS_PATH_BY_ROLE[role]
  );

  if (isSettingsRoute) {
    return (
      <nav className={styles.navbar} aria-label="Primary">
        <Link to={HOME_PATH_BY_ROLE[role]} className={styles.brand}>
          {brandLabel}
        </Link>

        <div className={styles.links}>
          <span className={styles.settingsLabel}>Settings</span>
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
        {creditIndicator}
        {composeButton}
        {notificationBell}
        <Link
          to={HOME_PATH_BY_ROLE[role]}
          className={styles.iconLink}
          aria-label="Home"
          onClick={() => setIsMenuOpen(false)}
        >
          <Home size={18} aria-hidden="true" />
          <span className={styles.iconLabel}>Home</span>
        </Link>
        <Link
          to={SETTINGS_PATH_BY_ROLE[role]}
          className={styles.iconLink}
          aria-label="Settings"
          onClick={() => setIsMenuOpen(false)}
        >
          <Settings size={18} aria-hidden="true" />
          <span className={styles.iconLabel}>Settings</span>
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
