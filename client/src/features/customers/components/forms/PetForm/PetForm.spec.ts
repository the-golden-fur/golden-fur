import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createPet } from '../../../api/customer.api';
import { PetForm } from './PetForm';

vi.mock('../../../api/customer.api', () => ({
  createPet: vi.fn(),
}));

describe('PetForm', () => {
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
        'Name, species, weight class, and coat type are required.'
      )
    ).toBeInTheDocument();
    expect(createPet).not.toHaveBeenCalled();
  });

  it('AC-1/AC-4: submits with all required fields and calls onCreated', async () => {
    const pet = {
      id: 'pet-1',
      customer_id: 'customer-1',
      name: 'Buddy',
      species: 'Dog' as const,
      breed: null,
      gender: null,
      date_of_birth: null,
      weight_class: 'M' as const,
      coat_type: 'SC' as const,
      health_conditions: null,
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
    fireEvent.change(screen.getByLabelText('Species'), {
      target: { value: 'Dog' },
    });
    fireEvent.change(screen.getByLabelText('Weight class'), {
      target: { value: 'M' },
    });
    fireEvent.change(screen.getByLabelText('Coat type'), {
      target: { value: 'SC' },
    });

    fireEvent.click(screen.getByRole('button', { name: /add pet/i }));

    await vi.waitFor(() => expect(createPet).toHaveBeenCalled());
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(pet));
  });
});
