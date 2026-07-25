import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  getPet,
  getPetHealthConditions,
  updatePet,
} from '../../api/customer.api';
import { PetProfilePage } from './PetProfilePage';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/customer.api', () => ({
  getPet: vi.fn(),
  updatePet: vi.fn(),
  uploadPetPhoto: vi.fn(),
  getPetHealthConditions: vi.fn(() =>
    Promise.resolve({ data: null, error: null })
  ),
  listVaccinationRecords: vi.fn(() =>
    Promise.resolve({ data: [], error: null })
  ),
  listMedicalNotes: vi.fn(() => Promise.resolve({ data: [], error: null })),
  listBreeds: vi.fn(() =>
    Promise.resolve({
      data: [
        {
          id: 'breed-1',
          pet_type: 'Dog',
          name: 'Labrador Retriever',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    })
  ),
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
        pet_type: 'Dog',
        breed_id: 'breed-1',
        photo_url: null,
        gender: 'Male',
        date_of_birth: null,
        weight_class: 'L',
        coat_type: 'SC',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });

    renderAtPetRoute('pet-1');

    expect(await screen.findByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Dog')).toBeInTheDocument();
    expect(screen.getByText('No service history yet.')).toBeInTheDocument();
  });

  it('AC-6: a 403 from the server surfaces as a clear error state, not a blank page', async () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: 'token' } as never);
    vi.mocked(getPet).mockResolvedValue({ data: null, error: 'Forbidden' });

    renderAtPetRoute('pet-1');

    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
  });

  it('Issue #78: renders the read-only health-condition badge when one is recorded', async () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: 'token' } as never);
    vi.mocked(getPet).mockResolvedValue({
      data: {
        id: 'pet-1',
        customer_id: 'customer-1',
        name: 'Buddy',
        pet_type: 'Dog',
        breed_id: 'breed-1',
        photo_url: null,
        gender: 'Male',
        date_of_birth: null,
        weight_class: 'L',
        coat_type: 'SC',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });
    vi.mocked(getPetHealthConditions).mockResolvedValue({
      data: {
        id: 'hc-1',
        pet_id: 'pet-1',
        conditions_text: 'Seasonal allergies',
        updated_by_staff_id: 'vet-1',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });

    renderAtPetRoute('pet-1');

    expect(await screen.findByText('Seasonal allergies')).toBeInTheDocument();
  });

  it('lets the owning customer edit and save changes (a customer session here always owns the pet)', async () => {
    vi.mocked(useAuth).mockReturnValue({ accessToken: 'token' } as never);
    const pet = {
      id: 'pet-1',
      customer_id: 'customer-1',
      name: 'Buddy',
      pet_type: 'Dog' as const,
      breed_id: 'breed-1',
      photo_url: null,
      gender: null,
      date_of_birth: null,
      weight_class: 'L' as const,
      coat_type: 'SC' as const,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    vi.mocked(getPet).mockResolvedValue({ data: pet, error: null });
    vi.mocked(updatePet).mockResolvedValue({
      data: { ...pet, name: 'Buddy II' },
      error: null,
    });

    renderAtPetRoute('pet-1');

    await screen.findByText('Dog');
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Buddy II' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await vi.waitFor(() =>
      expect(updatePet).toHaveBeenCalledWith(
        'pet-1',
        'token',
        expect.objectContaining({ name: 'Buddy II' })
      )
    );
    expect(await screen.findByText('Buddy II')).toBeInTheDocument();
  });
});
