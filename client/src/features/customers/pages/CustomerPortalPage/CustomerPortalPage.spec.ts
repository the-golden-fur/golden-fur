import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import { getCustomerProfile } from '../../api/customer.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import {
  listCreditBalances,
  listCreditHistory,
} from '../../../credits/api/credits.api';
import { listNotifications } from '../../../notifications/api/notifications.api';
import { CustomerPortalPage } from './CustomerPortalPage';

vi.mock('../../api/customer.api', () => ({
  getCustomerProfile: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../../credits/api/credits.api', () => ({
  listCreditBalances: vi.fn(),
  listCreditHistory: vi.fn(),
}));

vi.mock('../../../notifications/api/notifications.api', () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'customer-1', email: 'customer@example.com' },
    accessToken: 'token',
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
        createElement(CustomerPortalPage)
      )
    )
  );
}

describe('CustomerPortalPage', () => {
  beforeEach(() => {
    vi.mocked(listBranches).mockResolvedValue({ data: [], error: null });
    vi.mocked(listCreditBalances).mockResolvedValue({ data: [], error: null });
    vi.mocked(listCreditHistory).mockResolvedValue({ data: [], error: null });
    vi.mocked(listNotifications).mockResolvedValue({ data: [], error: null });
  });

  it('greets the customer by name once their profile loads, instead of a navigation tile grid', async () => {
    vi.mocked(getCustomerProfile).mockResolvedValue({
      data: {
        id: 'customer-1',
        full_name: 'Jane Dela Cruz',
        contact_number: null,
        emergency_contact_name: null,
        emergency_contact_number: null,
        preferred_communication_channel: null,
        account_email: 'jane@example.com',
        primary_auth_provider: 'email',
        facebook_id: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole('heading', {
        name: 'Welcome back, Jane Dela Cruz!',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /book a service/i })
    ).not.toBeInTheDocument();
  });

  it('shows a generic welcome before the profile has loaded', () => {
    vi.mocked(getCustomerProfile).mockResolvedValue({
      data: null,
      error: 'pending',
    });

    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Welcome back!' })
    ).toBeInTheDocument();
  });

  it('#95: shows a credit balance card for a branch with a nonzero balance', async () => {
    vi.mocked(getCustomerProfile).mockResolvedValue({
      data: null,
      error: 'pending',
    });
    vi.mocked(listBranches).mockResolvedValue({
      data: [{ id: 'branch-1', name: 'Makati', is_vet_branch: false }],
      error: null,
    });
    vi.mocked(listCreditBalances).mockResolvedValue({
      data: [
        {
          id: 'bal-1',
          customer_id: 'customer-1',
          branch_id: 'branch-1',
          balance: 500,
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Makati')).toBeInTheDocument();
    expect(screen.getByText('₱500.00')).toBeInTheDocument();
    expect(listCreditBalances).toHaveBeenCalledWith('token');
  });

  it('#95: shows nothing extra when the customer has no credit anywhere', async () => {
    vi.mocked(getCustomerProfile).mockResolvedValue({
      data: null,
      error: 'pending',
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Welcome back!' });
    expect(screen.queryByText(/₱/)).not.toBeInTheDocument();
  });
});
