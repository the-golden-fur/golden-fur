import { fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  createBreedAdmin,
  archiveBreedAdmin,
  listBreedsAdmin,
  listPetTypes,
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
  archiveBreedAdmin: vi.fn(),
  listPetTypes: vi.fn(),
}));

const PET_TYPES = [
  {
    id: 'pet-type-dog',
    key: 'Dog',
    name: 'Dog',
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pet-type-cat',
    key: 'Cat',
    name: 'Cat',
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

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
  beforeEach(() => {
    vi.mocked(listPetTypes).mockResolvedValue({ data: PET_TYPES, error: null });
  });

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

  it('lists every breed in one combined table, with a Pet type badge', async () => {
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
    // Pet type badges next to each breed (not separate "X breeds" sections).
    expect(screen.getAllByText('Dog').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Cat').length).toBeGreaterThanOrEqual(1);
  });

  it('switches to Board view, grouped by Pet type by default', async () => {
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

    const { container } = renderPage();
    await screen.findByText('Beagle');

    fireEvent.click(screen.getByRole('button', { name: 'Board' }));

    // One column per pet type (Dog, Cat).
    expect(
      container.querySelectorAll('section:not([aria-labelledby])')
    ).toHaveLength(2);
    expect(screen.getByText('Beagle')).toBeInTheDocument();
    expect(screen.getByText('Persian')).toBeInTheDocument();
  });

  it('tap-to-hold: Board view has no persistent "..." button - right-click/long-press opens the same menu instead', async () => {
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
    await screen.findByText('Beagle');

    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    await screen.findByText('Beagle');

    expect(
      screen.queryByRole('button', { name: 'Actions for Beagle' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Beagle'));
    expect(
      screen.getByRole('menuitem', { name: 'Rename' })
    ).toBeInTheDocument();
  });

  it('a Pet type filter tile narrows the breed list', async () => {
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
    await screen.findByText('Beagle');
    expect(screen.getByText('Persian')).toBeInTheDocument();

    // Pet type's default value is the first pet type option (Dog).
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pet type' }));

    expect(screen.getByText('Beagle')).toBeInTheDocument();
    expect(screen.queryByText('Persian')).not.toBeInTheDocument();
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

    await screen.findByText('No breeds match this filter.');
    fireEvent.click(screen.getByRole('button', { name: /^add breed$/i }));

    const dialog = screen.getByRole('dialog', { name: 'Add breed' });
    fireEvent.change(within(dialog).getByLabelText(/^name$/i), {
      target: { value: 'Poodle' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /add breed/i }));

    await vi.waitFor(() =>
      expect(createBreedAdmin).toHaveBeenCalledWith('token', {
        pet_type: 'Dog',
        name: 'Poodle',
      })
    );
    expect(await screen.findByText('Poodle')).toBeInTheDocument();
    // The modal closes on success - the form no longer sits on the page.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Beagle' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByRole('textbox', { name: /new breed name/i }), {
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

  it('a row exposes Configure, Rename and Archive behind the "..." menu', async () => {
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

    renderPage();

    await screen.findByText('Beagle');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Beagle' }));

    expect(screen.getByRole('menuitem', { name: 'Configure' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeVisible();
    expect(
      screen.queryByRole('menuitem', { name: 'Delete' })
    ).not.toBeInTheDocument();
  });

  it('Configure edits the breed name and pet type together', async () => {
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
      data: { ...BREEDS[0], name: 'Beagle X', pet_type: 'Cat' },
      error: null,
    });

    renderPage();

    await screen.findByText('Beagle');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Beagle' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Configure' }));

    const dialog = screen.getByRole('dialog', { name: 'Configure breed' });
    fireEvent.change(within(dialog).getByRole('combobox'), {
      target: { value: 'Cat' },
    });
    fireEvent.change(within(dialog).getByDisplayValue('Beagle'), {
      target: { value: 'Beagle X' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );

    await vi.waitFor(() =>
      expect(updateBreedAdmin).toHaveBeenCalledWith('breed-1', 'token', {
        pet_type: 'Cat',
        name: 'Beagle X',
      })
    );
  });

  it('archives a breed after confirming', async () => {
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
    vi.mocked(archiveBreedAdmin).mockResolvedValue({ data: null, error: null });

    renderPage();

    await screen.findByText('Beagle');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Beagle' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));

    // Nothing is archived until the confirm dialog is accepted.
    expect(archiveBreedAdmin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await vi.waitFor(() =>
      expect(archiveBreedAdmin).toHaveBeenCalledWith('breed-1', 'token')
    );
    expect(
      await screen.findByText('No breeds match this filter.')
    ).toBeInTheDocument();
  });

  it('surfaces an error when archiving fails', async () => {
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
    vi.mocked(archiveBreedAdmin).mockResolvedValue({
      data: null,
      error: 'Breed is already archived',
    });

    renderPage();

    await screen.findByText('Beagle');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Beagle' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(
      await screen.findByText(/Breed is already archived/i)
    ).toBeInTheDocument();
  });
});
