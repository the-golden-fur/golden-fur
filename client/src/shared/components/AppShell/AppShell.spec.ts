import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, Fragment, useEffect, useRef } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../auth/providers/AuthProvider/AuthContext';
import { useSidebarCollapse } from '../../hooks/useSidebarCollapse/useSidebarCollapse';
import { AppShell } from './AppShell';
import type { SidebarSection } from '../Sidebar/Sidebar';

// The customer shell mounts the HelpMascot, whose FAQ list fetches on open.
vi.mock('../../../features/faq/api/faq.api', () => ({
  fetchPublicFaqs: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

const SECTIONS: SidebarSection[] = [
  {
    label: null,
    items: [{ title: 'Dashboard', to: '/staff/dashboard/admin' }],
  },
];

// Custom change (SidebarCollapseProvider round-trip): stands in for what
// SettingsPage actually does - force-collapse on mount, restore whatever
// the sidebar was on unmount - so this file can prove a descendant of
// AppShell's <Outlet/> really does drive AppShell's own Sidebar, not just
// the context's inert default value.
function SidebarCollapseProbe() {
  const { collapsed, setCollapsed } = useSidebarCollapse();
  const initialCollapsedRef = useRef(collapsed);

  useEffect(() => {
    const wasCollapsed = initialCollapsedRef.current;
    setCollapsed(true);
    return () => setCollapsed(wasCollapsed);
  }, [setCollapsed]);

  return createElement('p', null, 'Probe content');
}

function renderShell() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'user-1', email: 'user@example.com' },
    accessToken: 'access',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/dashboard/admin'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            {
              element: createElement(AppShell, {
                role: 'staff',
                brandLabel: 'Golden Fur Staff',
                identity: { primary: 'jdoe', secondary: 'Admin' },
                sidebarSections: SECTIONS,
              }),
            },
            createElement(Route, {
              path: '/staff/dashboard/admin',
              element: createElement(
                Fragment,
                null,
                createElement('div', null, 'Dashboard content'),
                createElement(
                  Link,
                  { to: '/staff/settings-probe' },
                  'Open probe'
                )
              ),
            }),
            createElement(Route, {
              path: '/staff/settings-probe',
              element: createElement(
                Fragment,
                null,
                createElement(SidebarCollapseProbe),
                createElement(
                  Link,
                  { to: '/staff/dashboard/admin' },
                  'Close probe'
                )
              ),
            })
          )
        )
      )
    )
  );
}

/** A customer shell (so the HelpMascot and its Tutorial bubble render),
 * starting on a portal page other than home. */
function renderCustomerShell(onStartTutorial: () => void) {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'user-1', email: 'user@example.com' },
    accessToken: 'access',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/portal/bookings'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            {
              element: createElement(AppShell, {
                role: 'customer',
                brandLabel: 'Golden Fur',
                identity: { primary: 'Jane Doe' },
                sidebarSections: [
                  {
                    label: null,
                    items: [{ title: 'My Bookings', to: '/portal/bookings' }],
                  },
                ],
                onStartTutorial,
              }),
            },
            createElement(Route, {
              path: '/portal',
              element: createElement('div', null, 'Home content'),
            }),
            createElement(Route, {
              path: '/portal/bookings',
              element: createElement('div', null, 'Bookings content'),
            })
          )
        )
      )
    )
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders the navbar, sidebar, and routed page content together', () => {
    renderShell();

    expect(screen.getByTestId('app-shell-navbar')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell-sidebar')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Primary' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Dashboard navigation' })
    ).toBeInTheDocument();
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });

  it('persists the collapsed state to localStorage, scoped per role', async () => {
    renderShell();

    await userEvent.click(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    );

    expect(window.localStorage.getItem('sidebar-collapsed-staff')).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' })
    ).toBeInTheDocument();
  });

  it('reads a previously-collapsed preference back on mount', () => {
    window.localStorage.setItem('sidebar-collapsed-staff', 'true');

    renderShell();

    expect(
      screen.getByRole('button', { name: 'Expand sidebar' })
    ).toBeInTheDocument();
  });

  it('custom change (SidebarCollapseProvider): a descendant under <Outlet/> can force-collapse the real Sidebar, and restores it on unmount', async () => {
    renderShell();
    const user = userEvent.setup();

    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open probe' }));

    expect(await screen.findByText('Probe content')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Close probe' }));

    expect(await screen.findByText('Dashboard content')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    ).toBeInTheDocument();
  });

  it('custom change (SidebarCollapseProvider): restores a pre-existing collapsed state instead of forcing it back open', async () => {
    window.localStorage.setItem('sidebar-collapsed-staff', 'true');
    renderShell();
    const user = userEvent.setup();

    expect(
      screen.getByRole('button', { name: 'Expand sidebar' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open probe' }));
    await screen.findByText('Probe content');

    await user.click(screen.getByRole('link', { name: 'Close probe' }));

    expect(await screen.findByText('Dashboard content')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' })
    ).toBeInTheDocument();
  });

  it("the mascot's Tutorial takes the customer home and opens the sidebar first", async () => {
    window.localStorage.setItem('sidebar-collapsed-customer', 'true');
    const onStartTutorial = vi.fn();
    renderCustomerShell(onStartTutorial);

    expect(screen.getByText('Bookings content')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tutorial' }));

    expect(onStartTutorial).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Home content')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    ).toBeInTheDocument();
  });

  describe('custom change (responsive navigation): phone drawer', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function drawer() {
      return document.getElementById('mobile-nav-drawer') as HTMLElement;
    }

    async function openDrawer() {
      await userEvent.click(
        screen.getByRole('button', { name: 'Open navigation' })
      );
    }

    it('replaces the sidebar rail with a closed drawer and a hamburger', () => {
      renderShell();

      expect(
        screen.queryByRole('button', { name: 'Collapse sidebar' })
      ).not.toBeInTheDocument();
      expect(drawer()).toHaveAttribute('inert');
      expect(
        screen.getByRole('button', { name: 'Open navigation' })
      ).toBeInTheDocument();
    });

    it('opens from the hamburger, with the account items inside', async () => {
      renderShell();

      await openDrawer();

      expect(drawer()).not.toHaveAttribute('inert');
      expect(screen.getByTestId('mobile-nav-backdrop')).toBeInTheDocument();
      const menu = screen.getByRole('dialog', { name: 'Navigation menu' });
      expect(menu).toHaveTextContent('jdoe');
      expect(menu).toHaveTextContent('Sign out');
    });

    it('closes on a backdrop tap', async () => {
      renderShell();
      await openDrawer();

      await userEvent.click(screen.getByTestId('mobile-nav-backdrop'));

      expect(drawer()).toHaveAttribute('inert');
      expect(
        screen.queryByTestId('mobile-nav-backdrop')
      ).not.toBeInTheDocument();
    });

    it('closes on Escape and returns focus to the hamburger', async () => {
      renderShell();
      await openDrawer();

      await userEvent.keyboard('{Escape}');

      expect(drawer()).toHaveAttribute('inert');
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Open navigation' })
      );
    });

    it('closes when the route changes', async () => {
      renderShell();
      await openDrawer();

      await userEvent.click(screen.getByRole('link', { name: 'Open probe' }));

      expect(await screen.findByText('Probe content')).toBeInTheDocument();
      expect(drawer()).toHaveAttribute('inert');
    });

    it("the mascot's Tutorial opens the drawer on the home page", async () => {
      renderCustomerShell(vi.fn());

      await userEvent.click(screen.getByRole('button', { name: 'Help' }));
      await userEvent.click(screen.getByRole('button', { name: 'Tutorial' }));

      expect(await screen.findByText('Home content')).toBeInTheDocument();
      expect(drawer()).not.toHaveAttribute('inert');
    });

    it('leaves the desktop collapse preference untouched', async () => {
      renderShell();
      await openDrawer();
      await userEvent.keyboard('{Escape}');

      expect(window.localStorage.getItem('sidebar-collapsed-staff')).toBeNull();
    });
  });
});
