import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  listCustomerPets,
  listCustomers,
} from '../../../customers/api/customer.api';
import { listStaff } from '../../api/staff.api';
import { CustomerManagementPage } from './CustomerManagementPage';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  listCustomers: vi.fn(),
  listCustomerPets: vi.fn(),
  createPet: vi.fn(),
  listBreeds: vi.fn(() => Promise.resolve({ data: [], error: null })),
  uploadPetPhoto: vi.fn(),
}));

const CUSTOMER = {
  id: 'customer-1',
  full_name: 'Jane Dela Cruz',
  contact_number: '+63 917 000 0001',
  emergency_contact_name: 'John Dela Cruz',
  emergency_contact_number: '+63 917 000 0002',
  preferred_communication_channel: 'Text' as const,
  account_email: 'jane@example.com',
  primary_auth_provider: 'email' as const,
  facebook_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function renderPage() {
  return render(
    createElement(MemoryRouter, null, createElement(CustomerManagementPage))
  );
}

describe('CustomerManagementPage (#76)', () => {
  it('AC-1: is reachable for a Receptionist, renders under the "Customer Management" label, and lists customers', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [CUSTOMER],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Customer Management')).toBeInTheDocument();
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
      expect(screen.queryByText('Customer Management')).not.toBeInTheDocument()
    );
  });

  it('AC-2/AC-3: expanding a row opens the "…" menu, not a create-pet form; Check Profile shows customer details', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [CUSTOMER],
      error: null,
    });

    renderPage();

    await screen.findByText('Jane Dela Cruz');
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /customer actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /check profile/i }));

    expect(
      await screen.findByText('John Dela Cruz (+63 917 000 0002)')
    ).toBeInTheDocument();
  });

  it("AC-3/AC-4: View Pets lists the customer's existing pets", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [CUSTOMER],
      error: null,
    });
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [
        {
          id: 'pet-1',
          customer_id: 'customer-1',
          name: 'Buddy',
          pet_type: 'Dog',
          breed_id: null,
          photo_url: null,
          gender: null,
          date_of_birth: null,
          weight_class: 'M',
          coat_type: 'SC',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Jane Dela Cruz');
    fireEvent.click(screen.getByRole('button', { name: /customer actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /view pets/i }));

    expect(await screen.findByText('Buddy')).toBeInTheDocument();
    expect(listCustomerPets).toHaveBeenCalledWith('customer-1', 'token');
    // Issue #76 follow-up: links to the staff-reachable pet route, not
    // /portal/pets/:id (CustomerAuthGuard-gated - would redirect a staff
    // viewer away).
    expect(screen.getByRole('link', { name: /buddy/i })).toHaveAttribute(
      'href',
      '/staff/pets/pet-1'
    );
  });

  it('AC-3: Add Pet opens the create-pet form (one option among several)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(listCustomers).mockResolvedValue({
      data: [CUSTOMER],
      error: null,
    });

    renderPage();

    await screen.findByText('Jane Dela Cruz');
    fireEvent.click(screen.getByRole('button', { name: /customer actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /add pet/i }));

    expect(await screen.findByLabelText(/^name$/i)).toBeInTheDocument();
  });
});
