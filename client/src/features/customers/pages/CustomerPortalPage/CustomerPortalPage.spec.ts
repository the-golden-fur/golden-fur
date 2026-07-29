import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import { getCustomerProfile } from '../../api/customer.api';
import { CustomerPortalPage } from './CustomerPortalPage';

vi.mock('../../api/customer.api', () => ({
  getCustomerProfile: vi.fn(),
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
});
