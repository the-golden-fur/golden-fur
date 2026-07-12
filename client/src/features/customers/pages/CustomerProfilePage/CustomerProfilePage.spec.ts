import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  getCustomerProfile,
  listCustomerPets,
  updateCustomerProfile,
} from '../../api/customer.api';
import { CustomerProfilePage } from './CustomerProfilePage';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/customer.api', () => ({
  getCustomerProfile: vi.fn(),
  listCustomerPets: vi.fn(),
  updateCustomerProfile: vi.fn(),
}));

function buildProfile() {
  return {
    id: 'customer-1',
    full_name: 'Jane Dela Cruz',
    contact_number: '09171234567',
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    account_email: 'jane@example.com',
    primary_auth_provider: 'email' as const,
    facebook_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('CustomerProfilePage', () => {
  it("AC-1: renders the logged-in customer's profile fields", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'customer-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(getCustomerProfile).mockResolvedValue({
      data: buildProfile(),
      error: null,
    });
    vi.mocked(listCustomerPets).mockResolvedValue({ data: [], error: null });

    render(createElement(CustomerProfilePage));

    expect(
      await screen.findByDisplayValue('Jane Dela Cruz')
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('09171234567')).toBeInTheDocument();
  });

  it('AC-2: saving edits calls updateCustomerProfile and reflects the update without reload', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'customer-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(getCustomerProfile).mockResolvedValue({
      data: buildProfile(),
      error: null,
    });
    vi.mocked(listCustomerPets).mockResolvedValue({ data: [], error: null });
    vi.mocked(updateCustomerProfile).mockResolvedValue({
      data: { ...buildProfile(), full_name: 'Jane Updated' },
      error: null,
    });

    render(createElement(CustomerProfilePage));

    const nameInput = await screen.findByDisplayValue('Jane Dela Cruz');
    fireEvent.change(nameInput, { target: { value: 'Jane Updated' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(updateCustomerProfile).toHaveBeenCalledWith(
      'customer-1',
      'token',
      expect.objectContaining({ full_name: 'Jane Updated' })
    );
  });
});
