import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../auth/providers/AuthProvider/AuthContext';
import { AppShell } from './AppShell';
import type { SidebarSection } from '../Sidebar/Sidebar';

const SECTIONS: SidebarSection[] = [
  {
    label: null,
    items: [{ title: 'Dashboard', to: '/staff/dashboard/admin' }],
  },
];

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
              element: createElement('div', null, 'Dashboard content'),
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
});
