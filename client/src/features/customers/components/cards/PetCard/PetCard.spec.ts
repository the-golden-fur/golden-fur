import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Pet } from '../../../customer.types';
import { PetCard } from './PetCard';

function buildPet(overrides: Partial<Pet> = {}): Pet {
  return {
    id: 'pet-1',
    customer_id: 'customer-1',
    name: 'Buddy',
    species: 'Dog',
    breed: null,
    gender: null,
    date_of_birth: null,
    weight_class: 'M',
    coat_type: 'SC',
    health_conditions: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderWithRouter(pet: Pet) {
  return render(
    createElement(MemoryRouter, null, createElement(PetCard, { pet }))
  );
}

describe('PetCard', () => {
  it('AC-3: renders name, species, and weight_class/coat_type badges', () => {
    renderWithRouter(buildPet());

    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Dog')).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('SC')).toBeInTheDocument();
  });

  it('AC-3: renders breed alongside species when present', () => {
    renderWithRouter(buildPet({ breed: 'Labrador' }));

    expect(screen.getByText('Labrador · Dog')).toBeInTheDocument();
  });

  it('AC-3: links to the PetProfilePage', () => {
    renderWithRouter(buildPet());

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/portal/pets/pet-1'
    );
  });
});
