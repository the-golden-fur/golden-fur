import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as customerApi from '../../../../customers/api/customer.api';
import { DeactivatedAccountNoticePage } from './DeactivatedAccountNoticePage';

vi.mock('../../../../customers/api/customer.api', () => ({
  activateCustomer: vi.fn(),
  getOwnCustomerAccountStatus: vi.fn(),
}));

function createAuthValue(
  overrides: Partial<AuthContextValue>
): AuthContextValue {
  return {
    session: null,
    user: { id: 'customer-1', email: 'jane@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as AuthContextValue;
}

function renderPage(authValue: AuthContextValue) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/account-deactivated'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/account-deactivated',
            element: createElement(DeactivatedAccountNoticePage),
          }),
          createElement(Route, {
            path: '/login',
            element: createElement('div', null, 'Login page'),
          }),
          createElement(Route, {
            path: '/portal',
            element: createElement('div', null, 'Customer portal'),
          })
        )
      )
    )
  );
}

function accountStatus(overrides: Record<string, unknown> = {}) {
  return {
    customer: {
      id: 'customer-1',
      is_active: false,
      anonymized_at: null,
      ...overrides,
    },
    auto_delete_policy_days: 30,
  };
}

describe('DeactivatedAccountNoticePage', () => {
  beforeEach(() => {
    vi.mocked(customerApi.getOwnCustomerAccountStatus).mockResolvedValue({
      data: accountStatus(),
      error: null,
    } as never);
  });

  it('redirects to login when there is no session', () => {
    renderPage(createAuthValue({ user: null, accessToken: null }));

    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('shows the admin-configured day count and both actions', async () => {
    renderPage(createAuthValue({}));

    expect(await screen.findByText(/after 30 days/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^reactivate$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /log in to other account/i })
    ).toBeInTheDocument();
  });

  it('reactivating navigates to the portal', async () => {
    vi.mocked(customerApi.activateCustomer).mockResolvedValue({
      data: null,
      error: null,
    });

    renderPage(createAuthValue({}));

    await userEvent.click(
      await screen.findByRole('button', { name: /^reactivate$/i })
    );

    await waitFor(() =>
      expect(customerApi.activateCustomer).toHaveBeenCalledWith(
        'customer-1',
        'token'
      )
    );
    expect(await screen.findByText('Customer portal')).toBeInTheDocument();
  });

  it('shows an inline error when reactivation fails', async () => {
    vi.mocked(customerApi.activateCustomer).mockResolvedValue({
      data: null,
      error: 'This account has been permanently deleted',
    });

    renderPage(createAuthValue({}));

    await userEvent.click(
      await screen.findByRole('button', { name: /^reactivate$/i })
    );

    expect(
      await screen.findByText('This account has been permanently deleted')
    ).toBeInTheDocument();
  });

  it('logging in to another account signs out and redirects to login', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);

    renderPage(createAuthValue({ signOut }));

    await userEvent.click(
      await screen.findByRole('button', { name: /log in to other account/i })
    );

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('hides REACTIVATE and explains when the account is already anonymized', async () => {
    vi.mocked(customerApi.getOwnCustomerAccountStatus).mockResolvedValue({
      data: accountStatus({ anonymized_at: '2026-01-01T00:00:00.000Z' }),
      error: null,
    } as never);

    renderPage(createAuthValue({}));

    expect(
      await screen.findByText(/permanently deleted and can't be reactivated/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^reactivate$/i })
    ).not.toBeInTheDocument();
  });
});
