import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../auth/providers/AuthProvider/AuthContext';
import { Navbar } from './Navbar';

function renderNavbar(role: 'staff' | 'customer', signOut = vi.fn()) {
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
        createElement(Navbar, { role, brandLabel: 'Golden Fur' })
      )
    )
  );
}

describe('Navbar', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('links to the role-appropriate profile and settings paths', () => {
    renderNavbar('staff');

    expect(screen.getByRole('link', { name: 'My Profile' })).toHaveAttribute(
      'href',
      '/staff/profile'
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/staff/settings'
    );
  });

  it('links to the customer portal paths for a customer', () => {
    renderNavbar('customer');

    expect(screen.getByRole('link', { name: 'My Profile' })).toHaveAttribute(
      'href',
      '/portal/profile'
    );
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
