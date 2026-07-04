import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import { StaffLoginPage } from './StaffLoginPage';

vi.mock('../../api/staffAuth.api', () => ({
  login: vi.fn(),
  forgotPassword: vi.fn(),
}));

describe('StaffLoginPage', () => {
  it('renders the staff login screen', () => {
    const authValue: AuthContextValue = {
      session: null,
      user: null,
      accessToken: null,
      isLoading: false,
      refreshSession: vi.fn(),
      applySession: vi.fn(),
      signOut: vi.fn(),
    };

    render(
      createElement(
        MemoryRouter,
        null,
        createElement(
          AuthContext.Provider,
          { value: authValue },
          createElement(StaffLoginPage)
        )
      )
    );

    expect(
      screen.getByRole('heading', { name: /staff login/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });
});
