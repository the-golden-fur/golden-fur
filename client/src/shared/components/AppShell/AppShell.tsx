import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { MOBILE_NAV_DRAWER_ID, Navbar } from '../Navbar/Navbar';
import {
  DrawerAccountFooter,
  DrawerAccountHeader,
} from '../Navbar/NavbarAccount';
import {
  PHONE_MEDIA_QUERY,
  useMediaQuery,
} from '../../hooks/useMediaQuery/useMediaQuery';
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
  /** Settings > Profile's chosen avatar (upload or preset) - null/undefined
   * falls back to an initials placeholder in Navbar. */
  photoUrl?: string | null;
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
  /** Customer-only: replays the customer tutorial, wired to the
   * HelpMascot's "Tutorial" bubble. The shell first takes the customer to
   * the home page and opens the sidebar, since the tour points at its
   * links. */
  onStartTutorial?: () => void;
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
 *
 * Custom change (responsive navigation): at phone widths (PHONE_MEDIA_QUERY)
 * the Sidebar rail is replaced by a slide-in drawer opened from the Navbar's
 * hamburger. The drawer carries the account items too (identity, credits,
 * Home, Settings, Sign out), so a phone has one menu instead of two. It
 * closes on navigation, Escape, or a tap on the backdrop, and the page
 * behind it doesn't scroll while it's open. The desktop collapse preference
 * is neither used nor changed on phones.
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
  onStartTutorial,
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

  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // The path the drawer was opened on, not a plain boolean: any navigation
  // (a drawer link, the brand, a notification) changes the path, which
  // closes the drawer without an effect. Widening past the phone breakpoint
  // drops it for the rail the same way.
  const [mobileNavOpenedOn, setMobileNavOpenedOn] = useState<string | null>(
    null
  );
  const isDrawerOpen = isPhone && mobileNavOpenedOn === pathname;

  const closeMobileNav = useCallback(() => setMobileNavOpenedOn(null), []);
  const toggleMobileNav = () =>
    setMobileNavOpenedOn(isDrawerOpen ? null : pathname);

  // The tutorial always runs from the customer home page with the sidebar
  // open - the rail expanded on desktop, the drawer opened on a phone
  // (keyed to /portal, so the navigation below doesn't close it again).
  const startTutorial = onStartTutorial
    ? () => {
        if (pathname !== '/portal') navigate('/portal');
        if (isPhone) setMobileNavOpenedOn('/portal');
        else setCollapsedPersist(false);
        onStartTutorial();
      }
    : undefined;

  useEffect(() => {
    if (!isDrawerOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeMobileNav();
      // Back to the button that opened it.
      document
        .querySelector<HTMLElement>(`[aria-controls="${MOBILE_NAV_DRAWER_ID}"]`)
        ?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, closeMobileNav]);

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
          <div className={styles.navbarWrapper} data-testid="app-shell-navbar">
            <Navbar
              role={role}
              brandLabel={brandLabel}
              identity={identity}
              notificationBell={notificationBell}
              composeButton={composeButton}
              creditIndicator={creditIndicator}
              isPhone={isPhone}
              isMobileNavOpen={isDrawerOpen}
              onToggleMobileNav={toggleMobileNav}
            />
          </div>
          <div className={styles.body}>
            <div
              className={styles.sidebarWrapper}
              data-testid="app-shell-sidebar"
            >
              {isPhone ? (
                <>
                  <Sidebar
                    variant="drawer"
                    id={MOBILE_NAV_DRAWER_ID}
                    open={isDrawerOpen}
                    sections={sidebarSections}
                    collapsed={false}
                    onToggleCollapse={closeMobileNav}
                    role={role}
                    header={
                      <DrawerAccountHeader
                        identity={identity}
                        creditIndicator={creditIndicator}
                      />
                    }
                    footer={<DrawerAccountFooter role={role} />}
                  />
                  {isDrawerOpen ? (
                    <div
                      className={styles.backdrop}
                      data-testid="mobile-nav-backdrop"
                      aria-hidden="true"
                      onClick={closeMobileNav}
                    />
                  ) : null}
                </>
              ) : (
                <Sidebar
                  sections={sidebarSections}
                  collapsed={collapsed}
                  onToggleCollapse={toggleCollapse}
                  role={role}
                />
              )}
            </div>
            <main
              className={
                isDrawerOpen
                  ? `${styles.main} ${styles.mainLocked}`
                  : styles.main
              }
            >
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
              onStartTutorial={startTutorial}
            />
          ) : null}
        </div>
      </UnsavedChangesProvider>
    </SidebarCollapseProvider>
  );
}
