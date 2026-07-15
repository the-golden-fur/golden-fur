import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../../../shared/auth/providers/AuthProvider/AuthContext';
import { StaffLoginForm } from './StaffLoginForm';
import * as staffAuthApi from '../../../api/staffAuth.api';
import * as mfaApi from '../../../../../../shared/api/mfa.api';

vi.mock('../../../api/staffAuth.api', () => ({
  login: vi.fn(),
  forgotPassword: vi.fn(),
}));

vi.mock('../../../../../../shared/api/mfa.api', () => ({
  getMfaStatus: vi.fn(),
}));

function renderForm(applySession = vi.fn()) {
  const authValue: AuthContextValue = {
    session: null,
    user: null,
    accessToken: null,
    isLoading: false,
    refreshSession: vi.fn(),
    applySession,
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
  const getMfaStatusMock = vi.mocked(mfaApi.getMfaStatus);

  beforeEach(() => {
    loginMock.mockReset();
    forgotPasswordMock.mockReset();
    getMfaStatusMock.mockReset();
  });

  afterEach(() => {
    window.sessionStorage.clear();
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

  it('marks MFA pending after login when the account role requires MFA', async () => {
    const applySession = vi.fn().mockResolvedValue(undefined);
    loginMock.mockResolvedValue({
      data: { access_token: 'acc', refresh_token: 'ref', expires_in: 3600 },
      error: null,
    });
    getMfaStatusMock.mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: false },
      error: null,
    });

    renderForm(applySession);

    await userEvent.type(screen.getByLabelText(/username or email/i), 'admin');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'correct-pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(applySession).toHaveBeenCalledWith('acc', 'ref')
    );
    await waitFor(() =>
      expect(getMfaStatusMock).toHaveBeenCalledWith('staff', 'acc')
    );
    await waitFor(() =>
      expect(window.sessionStorage.getItem('staffMfaPending')).toBe('true')
    );
  });

  it('does not mark MFA pending for a role that does not require MFA', async () => {
    const applySession = vi.fn().mockResolvedValue(undefined);
    loginMock.mockResolvedValue({
      data: { access_token: 'acc', refresh_token: 'ref', expires_in: 3600 },
      error: null,
    });
    getMfaStatusMock.mockResolvedValue({
      data: { role: 'Groomer', mfa_enrolled: false },
      error: null,
    });

    renderForm(applySession);

    await userEvent.type(
      screen.getByLabelText(/username or email/i),
      'groomer'
    );
    await userEvent.type(screen.getByLabelText(/^password$/i), 'correct-pw');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(getMfaStatusMock).toHaveBeenCalled());
    expect(window.sessionStorage.getItem('staffMfaPending')).toBeNull();
  });
});
