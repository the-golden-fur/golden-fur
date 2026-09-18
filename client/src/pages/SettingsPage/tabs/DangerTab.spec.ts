import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../shared/auth/providers/AuthProvider/AuthContext';
import * as customerApi from '../../../features/customers/api/customer.api';
import { DangerTab } from './DangerTab';

vi.mock('../../../features/customers/api/customer.api', () => ({
  deactivateCustomer: vi.fn(),
  deleteOwnAccount: vi.fn(),
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

function renderDangerTab(authValue: AuthContextValue) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/portal/settings'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/portal/settings',
            element: createElement(DangerTab),
          }),
          createElement(Route, {
            path: '/login',
            element: createElement('div', null, 'Login page'),
          })
        )
      )
    )
  );
}

describe('DangerTab', () => {
  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });

  it('resets the sidebar layout localStorage keys without touching the account', async () => {
    window.localStorage.setItem(
      'settings-sidebar-sort-customer',
      'alphabetical'
    );
    window.localStorage.setItem('settings-sidebar-width-customer', '300');

    renderDangerTab(createAuthValue({}));

    await userEvent.click(
      screen.getByRole('button', { name: /reset settings to default/i })
    );
    await userEvent.click(screen.getByRole('button', { name: /^reset$/i }));

    expect(
      window.localStorage.getItem('settings-sidebar-sort-customer')
    ).toBeNull();
    expect(
      window.localStorage.getItem('settings-sidebar-width-customer')
    ).toBeNull();
    expect(customerApi.deactivateCustomer).not.toHaveBeenCalled();
    expect(customerApi.deleteOwnAccount).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Settings reset to default.')
    ).toBeInTheDocument();
  });

  it('deactivating signs the customer out and redirects to login', async () => {
    vi.mocked(customerApi.deactivateCustomer).mockResolvedValue({
      data: null,
      error: null,
    });
    const signOut = vi.fn().mockResolvedValue(undefined);

    renderDangerTab(createAuthValue({ signOut }));

    await userEvent.click(
      screen.getByRole('button', { name: /^deactivate account$/i })
    );
    await userEvent.click(
      screen.getByRole('button', { name: /yes, deactivate/i })
    );

    await waitFor(() =>
      expect(customerApi.deactivateCustomer).toHaveBeenCalledWith(
        'customer-1',
        'token'
      )
    );
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('shows an inline error and does not sign out when deactivation fails', async () => {
    vi.mocked(customerApi.deactivateCustomer).mockResolvedValue({
      data: null,
      error: 'Something went wrong',
    });
    const signOut = vi.fn().mockResolvedValue(undefined);

    renderDangerTab(createAuthValue({ signOut }));

    await userEvent.click(
      screen.getByRole('button', { name: /^deactivate account$/i })
    );
    await userEvent.click(
      screen.getByRole('button', { name: /yes, deactivate/i })
    );

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('keeps the delete confirm button disabled until the account email is typed exactly', async () => {
    renderDangerTab(createAuthValue({}));

    await userEvent.click(
      screen.getByRole('button', { name: /^delete account$/i })
    );

    const confirmButton = screen.getByRole('button', {
      name: /yes, delete my account/i,
    });
    const emailInput = screen.getByRole('textbox');

    expect(confirmButton).toBeDisabled();

    await userEvent.type(emailInput, 'not-my-email@example.com');
    expect(confirmButton).toBeDisabled();

    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'jane@example.com');
    expect(confirmButton).toBeEnabled();

    expect(customerApi.deleteOwnAccount).not.toHaveBeenCalled();
  });

  it('accepts the account email with different case/whitespace', async () => {
    renderDangerTab(createAuthValue({}));

    await userEvent.click(
      screen.getByRole('button', { name: /^delete account$/i })
    );
    await userEvent.type(screen.getByRole('textbox'), '  JANE@EXAMPLE.COM  ');

    expect(
      screen.getByRole('button', { name: /yes, delete my account/i })
    ).toBeEnabled();
  });

  it('deleting the account requires the typed email and signs the customer out on success', async () => {
    vi.mocked(customerApi.deleteOwnAccount).mockResolvedValue({
      data: { outcome: 'deleted' },
      error: null,
    });
    const signOut = vi.fn().mockResolvedValue(undefined);

    renderDangerTab(createAuthValue({ signOut }));

    await userEvent.click(
      screen.getByRole('button', { name: /^delete account$/i })
    );
    await userEvent.type(screen.getByRole('textbox'), 'jane@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: /yes, delete my account/i })
    );

    await waitFor(() =>
      expect(customerApi.deleteOwnAccount).toHaveBeenCalledWith(
        'customer-1',
        'token'
      )
    );
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('clears the typed email when the dialog is cancelled and reopened', async () => {
    renderDangerTab(createAuthValue({}));

    await userEvent.click(
      screen.getByRole('button', { name: /^delete account$/i })
    );
    await userEvent.type(screen.getByRole('textbox'), 'jane@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: /keep my account/i })
    );

    await userEvent.click(
      screen.getByRole('button', { name: /^delete account$/i })
    );

    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: /yes, delete my account/i })
    ).toBeDisabled();
  });

  it('cancelling a confirm dialog performs no action', async () => {
    renderDangerTab(createAuthValue({}));

    await userEvent.click(
      screen.getByRole('button', { name: /^delete account$/i })
    );
    await userEvent.click(
      screen.getByRole('button', { name: /keep my account/i })
    );

    expect(
      screen.queryByRole('button', { name: /yes, delete my account/i })
    ).not.toBeInTheDocument();
    expect(customerApi.deleteOwnAccount).not.toHaveBeenCalled();
  });
});
