import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPet,
  listBreeds,
  uploadPetPhoto,
} from '../../../api/customer.api';
import { PetForm } from './PetForm';

vi.mock('../../../api/customer.api', () => ({
  createPet: vi.fn(),
  listBreeds: vi.fn(),
  uploadPetPhoto: vi.fn(),
}));

const BREEDS = [
  {
    id: 'breed-1',
    pet_type: 'Dog' as const,
    name: 'Labrador Retriever',
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

describe('PetForm', () => {
  beforeEach(() => {
    vi.mocked(listBreeds).mockResolvedValue({ data: BREEDS, error: null });
  });

  it('AC-4: blocks submission and does not call the API when required fields are missing', async () => {
    render(
      createElement(PetForm, {
        customerId: 'customer-1',
        accessToken: 'token',
        onCreated: vi.fn(),
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /add pet/i }));

    expect(
      await screen.findByText(
        'Name, pet type, weight class, and coat type are required.'
      )
    ).toBeInTheDocument();
    expect(createPet).not.toHaveBeenCalled();
  });

  it('Issue #77 AC-4: blocks submission with a clear message when no breed is selected', async () => {
    render(
      createElement(PetForm, {
        customerId: 'customer-1',
        accessToken: 'token',
        onCreated: vi.fn(),
      })
    );

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Buddy' },
    });
    fireEvent.change(screen.getByLabelText('Pet Type'), {
      target: { value: 'Dog' },
    });
    fireEvent.change(screen.getByLabelText('Weight class'), {
      target: { value: 'M' },
    });
    fireEvent.change(screen.getByLabelText('Coat type'), {
      target: { value: 'SC' },
    });

    fireEvent.click(screen.getByRole('button', { name: /add pet/i }));

    expect(
      await screen.findByText('Please select a breed.')
    ).toBeInTheDocument();
    expect(createPet).not.toHaveBeenCalled();
  });

  it('AC-1/AC-4: submits with all required fields (incl. breed) and calls onCreated', async () => {
    const pet = {
      id: 'pet-1',
      customer_id: 'customer-1',
      name: 'Buddy',
      pet_type: 'Dog' as const,
      breed_id: 'breed-1',
      photo_url: null,
      gender: null,
      date_of_birth: null,
      weight_class: 'M' as const,
      coat_type: 'SC' as const,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    vi.mocked(createPet).mockResolvedValue({ data: pet, error: null });
    const onCreated = vi.fn();

    render(
      createElement(PetForm, {
        customerId: 'customer-1',
        accessToken: 'token',
        onCreated,
      })
    );

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Buddy' },
    });
    fireEvent.change(screen.getByLabelText('Pet Type'), {
      target: { value: 'Dog' },
    });
    fireEvent.change(screen.getByLabelText('Weight class'), {
      target: { value: 'M' },
    });
    fireEvent.change(screen.getByLabelText('Coat type'), {
      target: { value: 'SC' },
    });

    const breedInput = screen.getByPlaceholderText('Search breed...');
    fireEvent.focus(breedInput);
    fireEvent.change(breedInput, { target: { value: 'Lab' } });
    fireEvent.click(await screen.findByText('Labrador Retriever'));

    fireEvent.click(screen.getByRole('button', { name: /add pet/i }));

    await vi.waitFor(() =>
      expect(createPet).toHaveBeenCalledWith(
        'customer-1',
        'token',
        expect.objectContaining({ breed_id: 'breed-1' })
      )
    );
    expect(uploadPetPhoto).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(pet));
  });
});
