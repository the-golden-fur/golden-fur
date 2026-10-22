import { type MouseEvent, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useUnsavedChangesContext } from '../../providers/UnsavedChangesProvider/UnsavedChangesContext';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import {
  AccountLinks,
  IdentityChip,
  SignOutButton,
  type NavbarIdentity,
} from './NavbarAccount';
import { HOME_PATH_BY_ROLE, SETTINGS_PATH_BY_ROLE } from './useSignOut';
import styles from './Navbar.module.css';

export type { NavbarIdentity } from './NavbarAccount';

/** The phone drawer's id - the hamburger's aria-controls target. */
export const MOBILE_NAV_DRAWER_ID = 'mobile-nav-drawer';

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
  /** Phone layout (AppShell's PHONE_MEDIA_QUERY): a hamburger opens the
   * navigation drawer, and the identity/credits/Home/Settings/Sign out move
   * into that drawer - only compose and the bell stay in the bar. */
  isPhone?: boolean;
  isMobileNavOpen?: boolean;
  onToggleMobileNav?: () => void;
}

/**
 * Persistent top bar for the authenticated staff/customer areas - rendered
 * once by AppShell (StaffAuthGuard/CustomerAuthGuard) rather than duplicated
 * per page. Navigation itself lives in the Sidebar. The identity chip is a
 * plain (non-interactive) display of who's signed in - Settings gets its own
 * explicit icon button instead of being an undiscoverable side effect of
 * clicking the username. Sign out stays a dedicated button (not folded into
 * Settings) since it's an account-wide action, not a setting.
 *
 * Custom change (live-review): Home also gets its own icon button here -
 * neither the Sidebar (staff or customer) has its own Dashboard/Home tile
 * any more, so this is now the only dedicated way back to it (the brand
 * link at the far left already went to the same place, but wasn't visually
 * an affordance for "go home").
 *
 * Custom change (responsive navigation): on phones the bar is just
 * hamburger + brand + compose + bell; everything else is in the drawer
 * AppShell slides in from the hamburger (one menu, not the old separate
 * "Menu" dropdown plus a separately-sliding sidebar).
 */
export function Navbar({
  role,
  brandLabel,
  identity,
  notificationBell,
  composeButton,
  creditIndicator,
  isPhone = false,
  isMobileNavOpen = false,
  onToggleMobileNav,
}: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const unsavedChanges = useUnsavedChangesContext();

  const handleBrandClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!unsavedChanges) {
      return;
    }
    event.preventDefault();
    unsavedChanges.guardIfDirty(() => navigate(HOME_PATH_BY_ROLE[role]));
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

  const hamburger =
    isPhone && onToggleMobileNav ? (
      <button
        type="button"
        className={styles.hamburger}
        aria-label={isMobileNavOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={isMobileNavOpen}
        aria-controls={MOBILE_NAV_DRAWER_ID}
        onClick={onToggleMobileNav}
      >
        {isMobileNavOpen ? (
          <X size={22} aria-hidden="true" />
        ) : (
          <Menu size={22} aria-hidden="true" />
        )}
      </button>
    ) : null;

  const brand = (
    <Link
      to={HOME_PATH_BY_ROLE[role]}
      className={styles.brand}
      onClick={isSettingsRoute ? handleBrandClick : undefined}
    >
      {brandLabel}
    </Link>
  );

  if (isSettingsRoute) {
    return (
      <nav className={styles.navbar} aria-label="Primary">
        <div className={styles.start}>
          {hamburger}
          {brand}
        </div>

        <div className={styles.links}>
          <span className={styles.settingsLabel}>Settings</span>
          {isPhone ? null : <SignOutButton role={role} />}
        </div>
      </nav>
    );
  }

  if (isPhone) {
    return (
      <nav className={styles.navbar} aria-label="Primary">
        <div className={styles.start}>
          {hamburger}
          {brand}
        </div>

        <div className={styles.links}>
          {composeButton}
          {notificationBell}
        </div>
      </nav>
    );
  }

  return (
    <nav className={styles.navbar} aria-label="Primary">
      {brand}

      <div className={styles.links}>
        {identity ? <IdentityChip identity={identity} /> : null}
        {creditIndicator}
        {composeButton}
        {notificationBell}
        <AccountLinks role={role} />
        <SignOutButton role={role} />
      </div>
    </nav>
  );
}
