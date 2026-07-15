import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../api/staff.api';
import { listCustomers } from '../../../customers/api/customer.api';
import { AdminCustomerListPage } from './AdminCustomerListPage';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  listCustomers: vi.fn(),
}));

function renderPage() {
  return render(
    createElement(MemoryRouter, null, createElement(AdminCustomerListPage))
  );
}

describe('AdminCustomerListPage', () => {
  it('AC-1: is reachable for a Receptionist and lists customers', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [
        {
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
      ],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Customer Directory')).toBeInTheDocument();
    expect(await screen.findByText('Jane Dela Cruz')).toBeInTheDocument();
  });

  it('AC-1: redirects a Groomer away from the page', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Groomer' }],
      error: null,
    } as never);

    renderPage();

    await vi.waitFor(() =>
      expect(screen.queryByText('Customer Directory')).not.toBeInTheDocument()
    );
  });
});
