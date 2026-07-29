import { useState, type ReactNode } from 'react';
import { Outlet } from 'react-router';
import { Navbar } from '../Navbar/Navbar';
import { Sidebar, type SidebarSection } from '../Sidebar/Sidebar';
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
  children,
}: AppShellProps) {
  const storageKey = `sidebar-collapsed-${role}`;
  const [collapsed, setCollapsed] = useState(() =>
    readStoredCollapsed(storageKey)
  );

  const toggleCollapse = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {
        // Best-effort only - a private-browsing quota error shouldn't block
        // the toggle from working for the rest of the session.
      }
      return next;
    });
  };

  return (
    <div className={styles.shell}>
      <div className={styles.navbarWrapper}>
        <Navbar role={role} brandLabel={brandLabel} identity={identity} />
      </div>
      <div className={styles.body}>
        <Sidebar
          sections={sidebarSections}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
        <main className={styles.main}>
          {children}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
