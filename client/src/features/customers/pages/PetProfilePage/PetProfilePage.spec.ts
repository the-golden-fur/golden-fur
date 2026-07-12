import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getPet } from '../../api/customer.api';
import { PetProfilePage } from './PetProfilePage';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/customer.api', () => ({
  getPet: vi.fn(),
  listVaccinationRecords: vi.fn(() =>
    Promise.resolve({ data: [], error: null })
  ),
  listMedicalNotes: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

function renderAtPetRoute(petId: string) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [`/portal/pets/${petId}`] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/portal/pets/:petId',
          element: createElement(PetProfilePage),
        })
      )
    )
  );
}

describe('PetProfilePage', () => {
  it("AC-5: renders the pet's attributes and the Service History empty state", async () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: 'token' } as never);
    vi.mocked(getPet).mockResolvedValue({
      data: {
        id: 'pet-1',
        customer_id: 'customer-1',
        name: 'Buddy',
        species: 'Dog',
        breed: 'Labrador',
        gender: 'Male',
        date_of_birth: null,
        weight_class: 'L',
        coat_type: 'SC',
        health_conditions: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });

    renderAtPetRoute('pet-1');

    expect(await screen.findByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Labrador')).toBeInTheDocument();
    expect(screen.getByText('No service history yet.')).toBeInTheDocument();
  });

  it('AC-6: a 403 from the server surfaces as a clear error state, not a blank page', async () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: 'token' } as never);
    vi.mocked(getPet).mockResolvedValue({ data: null, error: 'Forbidden' });

    renderAtPetRoute('pet-1');

    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
  });
});
