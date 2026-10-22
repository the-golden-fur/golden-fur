import type { ReactNode } from 'react';
import { Home, Settings } from 'lucide-react';
import { Link } from 'react-router';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import {
  HOME_PATH_BY_ROLE,
  SETTINGS_PATH_BY_ROLE,
  useSignOut,
} from './useSignOut';
import styles from './Navbar.module.css';

/**
 * The account half of the top bar - who's signed in, Home, Settings and Sign
 * out - shared by the desktop Navbar row and the phone navigation drawer
 * (AppShell), so both stay identical without duplicating markup or the
 * sign-out/unsaved-changes logic.
 */

export interface NavbarIdentity {
  /** Staff: username. Customer: full name (customers have no username/role). */
  primary: string;
  /** Staff role label - omitted for customers. */
  secondary?: string;
  /** Settings > Profile's chosen avatar (upload or preset) - null/undefined
   * falls back to an initials badge below. */
  photoUrl?: string | null;
}

/** First letter of up to the first two words - "Makati Superadmin 1" -> "MS",
 * "Jamie" -> "J". Used only when there's no photoUrl to show instead. */
function identityInitials(primary: string): string {
  return primary
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function IdentityAvatar({ identity }: { identity: NavbarIdentity }) {
  if (identity.photoUrl) {
    return (
      <img className={styles.identityAvatar} src={identity.photoUrl} alt="" />
    );
  }

  return (
    <span className={styles.identityAvatarFallback} aria-hidden="true">
      {identityInitials(identity.primary)}
    </span>
  );
}

/** A plain (non-interactive) display of who's signed in. */
export function IdentityChip({ identity }: { identity: NavbarIdentity }) {
  return (
    <div className={styles.identity}>
      <IdentityAvatar identity={identity} />
      <span className={styles.identityText}>
        <span className={styles.identityPrimary}>{identity.primary}</span>
        {identity.secondary ? (
          <span className={styles.identitySecondary}>{identity.secondary}</span>
        ) : null}
      </span>
    </div>
  );
}

export function SignOutButton({ role }: { role: ThemeRole }) {
  const { isSigningOut, requestSignOut } = useSignOut(role);

  return (
    <button
      type="button"
      className={styles.signOutButton}
      disabled={isSigningOut}
      onClick={requestSignOut}
    >
      {isSigningOut ? 'Signing out...' : 'Sign out'}
    </button>
  );
}

/** Home + Settings icon links. */
export function AccountLinks({ role }: { role: ThemeRole }) {
  return (
    <>
      <Link
        to={HOME_PATH_BY_ROLE[role]}
        className={styles.iconLink}
        data-tour="nav:home"
        aria-label="Home"
      >
        <Home size={18} aria-hidden="true" />
        <span className={styles.iconLabel}>Home</span>
      </Link>
      <Link
        to={SETTINGS_PATH_BY_ROLE[role]}
        className={styles.iconLink}
        data-tour="nav:settings"
        aria-label="Settings"
      >
        <Settings size={18} aria-hidden="true" />
        <span className={styles.iconLabel}>Settings</span>
      </Link>
    </>
  );
}

/** Top of the phone navigation drawer: who's signed in, plus the customer's
 * credit balance. */
export function DrawerAccountHeader({
  identity,
  creditIndicator,
}: {
  identity?: NavbarIdentity | null;
  creditIndicator?: ReactNode;
}) {
  if (!identity && !creditIndicator) return null;

  return (
    <div className={styles.drawerAccount}>
      {identity ? <IdentityChip identity={identity} /> : null}
      {creditIndicator}
    </div>
  );
}

/** Bottom of the phone navigation drawer: Home, Settings, Sign out. */
export function DrawerAccountFooter({ role }: { role: ThemeRole }) {
  return (
    <div className={styles.drawerAccount}>
      <AccountLinks role={role} />
      <SignOutButton role={role} />
    </div>
  );
}
