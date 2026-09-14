import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as mfaApi from '../../../../../shared/api/mfa.api';
import { MfaEnrollPage } from './MfaEnrollPage';

vi.mock('../../../../../shared/api/mfa.api', () => ({
  getMfaStatus: vi.fn(),
}));

vi.mock(
  '../../../../../shared/components/TotpEnrollPanel/TotpEnrollPanel',
  () => ({
    TotpEnrollPanel: () =>
      createElement('div', { 'data-testid': 'totp-enroll-panel' }),
  })
);

function renderAt(path: string, authValue: AuthContextValue) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/mfa/enroll',
            element: createElement(MfaEnrollPage),
          }),
          createElement(Route, {
            path: '/staff/mfa/verify',
            element: createElement('div', null, 'Verify page'),
          })
        )
      )
    )
  );
}

describe('MfaEnrollPage', () => {
  const authValue: AuthContextValue = {
    session: null,
    user: null,
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  it('bug fix: redirects an already-enrolled session to Verify instead of re-running enroll', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: true },
      error: null,
    });

    renderAt('/staff/mfa/enroll', authValue);

    await waitFor(() => {
      expect(screen.getByText('Verify page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('totp-enroll-panel')).not.toBeInTheDocument();
  });

  it('renders the enroll panel for a genuinely not-yet-enrolled session', async () => {
    vi.mocked(mfaApi.getMfaStatus).mockResolvedValue({
      data: { role: 'Admin', mfa_enrolled: false },
      error: null,
    });

    renderAt('/staff/mfa/enroll', authValue);

    await waitFor(() => {
      expect(screen.getByTestId('totp-enroll-panel')).toBeInTheDocument();
    });
  });
});
