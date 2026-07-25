import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  getPet,
  getPetHealthConditions,
  listMedicalNotes,
  listVaccinationRecords,
} from '../../../customers/api/customer.api';
import { listStaff } from '../../api/staff.api';
import { StaffPetProfilePage } from './StaffPetProfilePage';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
  getPetHealthConditions: vi.fn(() =>
    Promise.resolve({ data: null, error: null })
  ),
  listVaccinationRecords: vi.fn(() =>
    Promise.resolve({ data: [], error: null })
  ),
  listMedicalNotes: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

const PET = {
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

function renderAtPetRoute(petId: string) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [`/staff/pets/${petId}`] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/staff/pets/:petId',
          element: createElement(StaffPetProfilePage),
        }),
        createElement(Route, {
          path: '/staff/profile',
          element: createElement('div', null, 'Staff profile page'),
        })
      )
    )
  );
}

describe('StaffPetProfilePage', () => {
  it('redirects a non-CUSTOMER_MANAGER_ROLES viewer (e.g. Groomer) to /staff/profile', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Groomer' }],
      error: null,
    } as never);

    renderAtPetRoute('pet-1');

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('loads and renders the pet for an authorized staff role (Receptionist)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);
    vi.mocked(getPet).mockResolvedValue({ data: PET, error: null });

    renderAtPetRoute('pet-1');

    expect(await screen.findByText('Buddy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });

  it('surfaces a load error clearly instead of a blank page', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' }],
      error: null,
    } as never);
    vi.mocked(getPet).mockResolvedValue({ data: null, error: 'Not found' });

    renderAtPetRoute('pet-1');

    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });
});
