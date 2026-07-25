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

function renderWithRouter(pet: Pet, linkBasePath?: string) {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(PetCard, { pet, linkBasePath })
    )
  );
}

describe('PetCard', () => {
  it('AC-3: renders name, pet_type, and weight_class/coat_type badges', () => {
    renderWithRouter(buildPet());

    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Dog')).toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('SC')).toBeInTheDocument();
  });

  it('Issue #77: shows a fallback initial when no photo is set', () => {
    renderWithRouter(buildPet());

    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it("Issue #77: renders the pet's photo when photo_url is set", () => {
    renderWithRouter(buildPet({ photo_url: 'https://example.com/buddy.jpg' }));

    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://example.com/buddy.jpg'
    );
  });

  it('AC-3: links to the PetProfilePage', () => {
    renderWithRouter(buildPet());

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/portal/pets/pet-1'
    );
  });

  it('honors a custom linkBasePath (e.g. staff View Pets -> /staff/pets)', () => {
    renderWithRouter(buildPet(), '/staff/pets');

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/staff/pets/pet-1'
    );
  });
});
