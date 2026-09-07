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

describe('AppShell', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders the navbar, sidebar, and routed page content together', () => {
    renderShell();

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
});
