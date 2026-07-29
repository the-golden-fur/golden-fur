import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import { listCustomerPets } from '../../api/customer.api';
import type { Pet } from '../../customer.types';
import { CustomerPetManagerPage } from './CustomerPetManagerPage';

vi.mock('../../api/customer.api', () => ({
  listCustomerPets: vi.fn(),
}));

function buildPet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: 'pet-1',
    customer_id: 'customer-1',
    name: 'Bantay',
    pet_type: 'Dog',
    breed_id: null,
    photo_url: null,
    gender: null,
    date_of_birth: null,
    weight_class: 'M',
    coat_type: 'SC',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

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
        createElement(CustomerPetManagerPage)
      )
    )
  );
}

describe('CustomerPetManagerPage', () => {
  it('shows an empty state when the customer has no pets', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({ data: [], error: null });

    renderPage();

    expect(
      await screen.findByText("You haven't added any pets yet.")
    ).toBeInTheDocument();
  });

  it("lists the customer's pets, each linking to its pet profile", async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({
      data: [buildPet({ id: 'pet-1', name: 'Bantay' })],
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole('link', { name: /bantay/i })
    ).toHaveAttribute('href', '/portal/pets/pet-1');
  });

  it('toggles the Add a pet form open and closed', async () => {
    vi.mocked(listCustomerPets).mockResolvedValue({ data: [], error: null });

    renderPage();
    await screen.findByText("You haven't added any pets yet.");

    await userEvent.click(screen.getByRole('button', { name: 'Add a pet' }));
    expect(screen.getByRole('button', { name: 'Add pet' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('button', { name: 'Add pet' })
    ).not.toBeInTheDocument();
  });
});
