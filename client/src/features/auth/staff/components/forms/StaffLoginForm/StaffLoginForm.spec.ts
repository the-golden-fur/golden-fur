import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../../../shared/auth/providers/AuthProvider/AuthContext';
import { StaffLoginForm } from './StaffLoginForm';
import * as staffAuthApi from '../../../api/staffAuth.api';

vi.mock('../../../api/staffAuth.api', () => ({
  login: vi.fn(),
  forgotPassword: vi.fn(),
}));

function renderForm() {
  const authValue: AuthContextValue = {
    session: null,
    user: null,
    accessToken: null,
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(StaffLoginForm)
      )
    )
  );
}

describe('StaffLoginForm', () => {
  const loginMock = vi.mocked(staffAuthApi.login);
  const forgotPasswordMock = vi.mocked(staffAuthApi.forgotPassword);

  beforeEach(() => {
    loginMock.mockReset();
    forgotPasswordMock.mockReset();
  });

  it('shows an inline error for wrong credentials', async () => {
    loginMock.mockResolvedValue({ data: null, error: 'Unauthorized' });

    renderForm();

    await userEvent.type(screen.getByLabelText(/username or email/i), 'admin');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid username or password.'
    );
  });

  it('shows confirmation when forgot password succeeds', async () => {
    forgotPasswordMock.mockResolvedValue({
      data: { message: 'Password reset email sent' },
      error: null,
    });

    renderForm();

    await userEvent.type(
      screen.getByLabelText(/reset email/i),
      'staff@example.com'
    );
    await userEvent.click(
      screen.getByRole('button', { name: /forgot password/i })
    );

    await waitFor(() =>
      expect(screen.getByText('Password reset email sent')).toBeInTheDocument()
    );
  });
});
