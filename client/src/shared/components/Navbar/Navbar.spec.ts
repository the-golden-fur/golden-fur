import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../auth/providers/AuthProvider/AuthContext';
import { Navbar } from './Navbar';

function renderNavbar(
  role: 'staff' | 'customer',
  signOut = vi.fn(),
  identity: { primary: string; secondary?: string } | null = null
) {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'user-1', email: 'user@example.com' },
    accessToken: 'access',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut,
  };

  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(Navbar, { role, brandLabel: 'Golden Fur', identity })
      )
    )
  );
}

describe('Navbar', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('shows the staff identity (username + role) as plain text, not a link', () => {
    renderNavbar('staff', vi.fn(), { primary: 'jdoe', secondary: 'Admin' });

    expect(screen.getByText('jdoe')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /jdoe/ })
    ).not.toBeInTheDocument();
  });

  it('shows the customer identity (full name only, no role) as plain text', () => {
    renderNavbar('customer', vi.fn(), { primary: 'Jane Doe' });

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /jane doe/i })
    ).not.toBeInTheDocument();
  });

  it('renders no identity text while identity is still loading, but always shows the Settings link', () => {
    renderNavbar('staff');

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/staff/settings'
    );
  });

  it("links the Settings icon to the customer portal's settings path", () => {
    renderNavbar('customer');

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/portal/settings'
    );
  });

  it('signs out and clears MFA pending flags when Sign out is clicked', async () => {
    window.sessionStorage.setItem('staffMfaPending', 'true');
    const signOut = vi.fn().mockResolvedValue(undefined);

    renderNavbar('staff', signOut);

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('staffMfaPending')).toBeNull();
  });
});
