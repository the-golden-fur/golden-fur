import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPetHealthConditions,
  listBreeds,
  listMedicalNotes,
  listVaccinationRecords,
  updatePet,
  uploadPetPhoto,
} from '../../../api/customer.api';
import type { Pet } from '../../../customer.types';
import { PetDetailPanel } from './PetDetailPanel';

vi.mock('../../../api/customer.api', () => ({
  updatePet: vi.fn(),
  uploadPetPhoto: vi.fn(),
  getPetHealthConditions: vi.fn(),
  listVaccinationRecords: vi.fn(),
  listMedicalNotes: vi.fn(),
  listBreeds: vi.fn(),
}));

function buildPet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: 'pet-1',
    customer_id: 'customer-1',
    name: 'Buddy',
    pet_type: 'Dog',
    breed_id: 'breed-1',
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

const BREEDS = [
  {
    id: 'breed-1',
    pet_type: 'Dog' as const,
    name: 'Labrador Retriever',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'breed-2',
    pet_type: 'Dog' as const,
    name: 'Beagle',
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

describe('PetDetailPanel', () => {
  beforeEach(() => {
    vi.mocked(getPetHealthConditions).mockResolvedValue({
      data: null,
      error: null,
    });
    vi.mocked(listVaccinationRecords).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(listMedicalNotes).mockResolvedValue({ data: [], error: null });
    vi.mocked(listBreeds).mockResolvedValue({ data: BREEDS, error: null });
  });

  it('renders read-only attributes and shows Service History', async () => {
    render(
      createElement(PetDetailPanel, {
        pet: buildPet(),
        accessToken: 'token',
        canEdit: true,
        onUpdated: vi.fn(),
      })
    );

    expect(await screen.findByText('Dog')).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('SC')).toBeInTheDocument();
    expect(screen.getByText('No service history yet.')).toBeInTheDocument();
  });

  it('hides the Edit button when canEdit is false', async () => {
    render(
      createElement(PetDetailPanel, {
        pet: buildPet(),
        accessToken: 'token',
        canEdit: false,
        onUpdated: vi.fn(),
      })
    );

    await screen.findByText('Dog');
    expect(
      screen.queryByRole('button', { name: /^edit$/i })
    ).not.toBeInTheDocument();
  });

  it('toggling Edit shows the form prefilled, Cancel discards it', async () => {
    render(
      createElement(PetDetailPanel, {
        pet: buildPet(),
        accessToken: 'token',
        canEdit: true,
        onUpdated: vi.fn(),
      })
    );

    await screen.findByText('Dog');
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Buddy');

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });

  it('saves changes via updatePet and calls onUpdated', async () => {
    const onUpdated = vi.fn();
    const updatedPet = buildPet({ name: 'Buddy II' });
    vi.mocked(updatePet).mockResolvedValue({ data: updatedPet, error: null });

    render(
      createElement(PetDetailPanel, {
        pet: buildPet(),
        accessToken: 'token',
        canEdit: true,
        onUpdated,
      })
    );

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
        expect.objectContaining({ name: 'Buddy II', breed_id: 'breed-1' })
      )
    );
    expect(uploadPetPhoto).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updatedPet));
  });

  it('blocks saving with no breed selected', async () => {
    render(
      createElement(PetDetailPanel, {
        pet: buildPet({ breed_id: null }),
        accessToken: 'token',
        canEdit: true,
        onUpdated: vi.fn(),
      })
    );

    await screen.findByText('Dog');
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(
      await screen.findByText('Please select a breed.')
    ).toBeInTheDocument();
    expect(updatePet).not.toHaveBeenCalled();
  });
});
