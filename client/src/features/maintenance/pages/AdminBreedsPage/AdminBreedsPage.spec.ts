import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  createBreedAdmin,
  deleteBreedAdmin,
  listBreedsAdmin,
  updateBreedAdmin,
} from '../../api/maintenance.api';
import { listStaff } from '../../../staff/api/staff.api';
import { AdminBreedsPage } from './AdminBreedsPage';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/maintenance.api', () => ({
  listBreedsAdmin: vi.fn(),
  createBreedAdmin: vi.fn(),
  updateBreedAdmin: vi.fn(),
  deleteBreedAdmin: vi.fn(),
}));

const BREEDS = [
  {
    id: 'breed-1',
    pet_type: 'Dog' as const,
    name: 'Beagle',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'breed-2',
    pet_type: 'Cat' as const,
    name: 'Persian',
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

function renderPage() {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/admin/maintenance/breeds'] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/staff/admin/maintenance/breeds',
          element: createElement(AdminBreedsPage),
        }),
        createElement(Route, {
          path: '/staff/settings',
          element: createElement('div', null, 'Staff profile page'),
        })
      )
    )
  );
}

describe('AdminBreedsPage', () => {
  it('redirects a non-Admin/Superadmin viewer', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' }],
      error: null,
    } as never);

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('lists breeds grouped by pet type for an Admin viewer', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' }],
      error: null,
    } as never);
    vi.mocked(listBreedsAdmin).mockResolvedValue({
      data: BREEDS,
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Beagle')).toBeInTheDocument();
    expect(screen.getByText('Persian')).toBeInTheDocument();
    expect(screen.getByText('Dog breeds')).toBeInTheDocument();
    expect(screen.getByText('Cat breeds')).toBeInTheDocument();
  });

  it('adds a new breed', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Superadmin' }],
      error: null,
    } as never);
    vi.mocked(listBreedsAdmin).mockResolvedValue({ data: [], error: null });
    vi.mocked(createBreedAdmin).mockResolvedValue({
      data: {
        id: 'breed-3',
        pet_type: 'Dog',
        name: 'Poodle',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });

    renderPage();

    await screen.findByText('No dog breeds yet.');
    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: 'Poodle' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add breed/i }));

    await vi.waitFor(() =>
      expect(createBreedAdmin).toHaveBeenCalledWith('token', {
        pet_type: 'Dog',
        name: 'Poodle',
      })
    );
    expect(await screen.findByText('Poodle')).toBeInTheDocument();
  });

  it('renames a breed', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' }],
      error: null,
    } as never);
    vi.mocked(listBreedsAdmin).mockResolvedValue({
      data: [BREEDS[0]],
      error: null,
    });
    vi.mocked(updateBreedAdmin).mockResolvedValue({
      data: { ...BREEDS[0], name: 'Beagle Renamed' },
      error: null,
    });

    renderPage();

    await screen.findByText('Beagle');
    fireEvent.click(screen.getByRole('button', { name: /rename/i }));
    fireEvent.change(screen.getByDisplayValue('Beagle'), {
      target: { value: 'Beagle Renamed' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await vi.waitFor(() =>
      expect(updateBreedAdmin).toHaveBeenCalledWith('breed-1', 'token', {
        name: 'Beagle Renamed',
      })
    );
    expect(await screen.findByText('Beagle Renamed')).toBeInTheDocument();
  });

  it('deletes a breed', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' }],
      error: null,
    } as never);
    vi.mocked(listBreedsAdmin).mockResolvedValue({
      data: [BREEDS[0]],
      error: null,
    });
    vi.mocked(deleteBreedAdmin).mockResolvedValue({ data: null, error: null });

    renderPage();

    await screen.findByText('Beagle');
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await vi.waitFor(() =>
      expect(deleteBreedAdmin).toHaveBeenCalledWith('breed-1', 'token')
    );
    expect(await screen.findByText('No dog breeds yet.')).toBeInTheDocument();
  });

  it('surfaces a 409 error when deleting a breed still in use', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'staff-1' },
      accessToken: 'token',
    } as never);
    vi.mocked(listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' }],
      error: null,
    } as never);
    vi.mocked(listBreedsAdmin).mockResolvedValue({
      data: [BREEDS[0]],
      error: null,
    });
    vi.mocked(deleteBreedAdmin).mockResolvedValue({
      data: null,
      error:
        'This breed is still assigned to one or more pets and cannot be deleted',
    });

    renderPage();

    await screen.findByText('Beagle');
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(
      await screen.findByText(/still assigned to one or more pets/i)
    ).toBeInTheDocument();
  });
});
