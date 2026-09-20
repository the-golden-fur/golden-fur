import { useCallback, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router';
import { Navbar } from '../Navbar/Navbar';
import { Sidebar, type SidebarSection } from '../Sidebar/Sidebar';
import { HelpMascot } from '../HelpMascot/HelpMascot';
import { SidebarCollapseProvider } from '../../providers/SidebarCollapseProvider/SidebarCollapseProvider';
import { UnsavedChangesProvider } from '../../providers/UnsavedChangesProvider/UnsavedChangesProvider';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import styles from './AppShell.module.css';

export interface AppShellIdentity {
  /** Staff: username. Customer: full name (customers have no role/username). */
  primary: string;
  /** Staff role label - omitted for customers. */
  secondary?: string;
}

interface AppShellProps {
  role: ThemeRole;
  brandLabel: string;
  identity: AppShellIdentity | null;
  sidebarSections: SidebarSection[];
  /** NotificationBell, passed through to Navbar. */
  notificationBell?: ReactNode;
  /** ComposeEntryPoint (mail icon), passed through to Navbar. */
  composeButton?: ReactNode;
  /** Customer-only CreditBalanceIndicator, passed through to Navbar. */
  creditIndicator?: ReactNode;
  /** Customer-only: opens the same compose modal as the Navbar's mail icon,
   * wired to the HelpMascot's "Contact support" link. */
  onContactSupport?: () => void;
  /** Rendered above the routed page content, below the navbar - e.g. the
   * staff-only UnavailabilityBlockBadge. */
  children?: ReactNode;
}

function readStoredCollapsed(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persistent shell (Navbar + collapsible Sidebar + routed content) rendered
 * once by StaffAuthGuard/CustomerAuthGuard, replacing their previous bare
 * `<Navbar/><Outlet/>`. Collapsed state is per-role so a staff member and a
 * customer session in the same browser don't share one preference.
 */
export function AppShell({
  role,
  brandLabel,
  identity,
  sidebarSections,
  notificationBell,
  composeButton,
  creditIndicator,
  onContactSupport,
  children,
}: AppShellProps) {
  const storageKey = `sidebar-collapsed-${role}`;
  const [collapsed, setCollapsed] = useState(() =>
    readStoredCollapsed(storageKey)
  );

  const setCollapsedPersist = useCallback(
    (next: boolean) => {
      setCollapsed(next);
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        // Best-effort only - a private-browsing quota error shouldn't block
        // the toggle from working for the rest of the session.
      }
    },
    [storageKey]
  );

  const toggleCollapse = () => setCollapsedPersist(!collapsed);

  return (
    <SidebarCollapseProvider
      collapsed={collapsed}
      setCollapsed={setCollapsedPersist}
    >
      {/* Custom change (unsaved changes): mounted once here, for the whole
          authenticated shell, rather than locally inside SettingsPage -
          Navbar (a sibling of the routed <Outlet/> content, not a
          descendant of it) needs the same context so leaving Settings via
          the brand link or Sign Out can be guarded too, not just in-page
          tab switches. Idle (registers nothing, renders nothing) on every
          route outside Settings. */}
      <UnsavedChangesProvider>
        <div className={styles.shell}>
          <div className={styles.navbarWrapper}>
            <Navbar
              role={role}
              brandLabel={brandLabel}
              identity={identity}
              notificationBell={notificationBell}
              composeButton={composeButton}
              creditIndicator={creditIndicator}
            />
          </div>
          <div className={styles.body}>
            <Sidebar
              sections={sidebarSections}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              role={role}
            />
            <main className={styles.main}>
              {children}
              <Outlet />
            </main>
          </div>

          {role === 'customer' ? (
            <HelpMascot
              links={[
                onContactSupport
                  ? { label: 'Contact support', onClick: onContactSupport }
                  : { label: 'Contact support', href: '#' },
                { label: 'My Bookings', href: '/portal/bookings' },
              ]}
            />
          ) : null}
        </div>
      </UnsavedChangesProvider>
    </SidebarCollapseProvider>
  );
}
