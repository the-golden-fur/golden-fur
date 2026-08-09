import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as hotelApi from '../../api/hotel.api';
import { AdminCagesPage } from './AdminCagesPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/hotel.api', () => ({
  getCageGrid: vi.fn(),
  createCage: vi.fn(),
  updateCage: vi.fn(),
  deleteCage: vi.fn(),
  setCageMaintenanceStatus: vi.fn(),
}));

const AVAILABLE_CAGE = {
  id: 'cage-1',
  branch_id: 'branch-1',
  cage_label: 'Makati-S-01',
  size: 'S',
  status: 'Available',
  created_at: '',
  updated_at: '',
};

const OCCUPIED_CAGE = {
  ...AVAILABLE_CAGE,
  id: 'cage-2',
  cage_label: 'Makati-M-01',
  size: 'M',
  status: 'Occupied',
};

function emptyGrid() {
  return { S: [], M: [], L: [], XL: [] };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'admin@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/admin/hotel/cages'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/hotel/cages',
            element: createElement(AdminCagesPage),
          })
        )
      )
    )
  );
}

describe('AdminCagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a non-Admin/Superadmin viewer', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Receptionist' } as never],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.queryByText('Cages')).not.toBeInTheDocument()
    );
  });

  it('lists cages with their status, for an Admin viewer', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' } as never],
      error: null,
    });
    vi.mocked(hotelApi.getCageGrid).mockResolvedValue({
      data: { ...emptyGrid(), S: [AVAILABLE_CAGE as never] },
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Makati-S-01')).toBeInTheDocument()
    );
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('creates a new cage', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' } as never],
      error: null,
    });
    vi.mocked(hotelApi.getCageGrid).mockResolvedValue({
      data: emptyGrid(),
      error: null,
    });
    vi.mocked(hotelApi.createCage).mockResolvedValue({
      data: AVAILABLE_CAGE as never,
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByPlaceholderText('e.g. Makati-S-03')
      ).toBeInTheDocument()
    );
    await user.type(
      screen.getByPlaceholderText('e.g. Makati-S-03'),
      'Makati-S-01'
    );
    await user.click(screen.getByRole('button', { name: 'Add cage' }));

    await waitFor(() =>
      expect(hotelApi.createCage).toHaveBeenCalledWith(
        'Makati-S-01',
        'S',
        'token'
      )
    );
    expect(await screen.findByText('Cage added.')).toBeInTheDocument();
  });

  it('deletes an Available cage but disables delete for an Occupied one', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Superadmin' } as never],
      error: null,
    });
    vi.mocked(hotelApi.getCageGrid).mockResolvedValue({
      data: {
        ...emptyGrid(),
        S: [AVAILABLE_CAGE as never],
        M: [OCCUPIED_CAGE as never],
      },
      error: null,
    });
    vi.mocked(hotelApi.deleteCage).mockResolvedValue({
      data: true,
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Makati-S-01')).toBeInTheDocument()
    );

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    // Occupied cage's Delete button is disabled.
    expect(deleteButtons[1]).toBeDisabled();

    await user.click(deleteButtons[0]);

    await waitFor(() =>
      expect(hotelApi.deleteCage).toHaveBeenCalledWith('cage-1', 'token')
    );
    expect(screen.queryByText('Makati-S-01')).not.toBeInTheDocument();
  });

  it('toggles Under Maintenance from the row action', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' } as never],
      error: null,
    });
    vi.mocked(hotelApi.getCageGrid).mockResolvedValue({
      data: { ...emptyGrid(), S: [AVAILABLE_CAGE as never] },
      error: null,
    });
    vi.mocked(hotelApi.setCageMaintenanceStatus).mockResolvedValue({
      data: { ...AVAILABLE_CAGE, status: 'Under Maintenance' } as never,
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Mark Under Maintenance' })
      ).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('button', { name: 'Mark Under Maintenance' })
    );

    await waitFor(() =>
      expect(hotelApi.setCageMaintenanceStatus).toHaveBeenCalledWith(
        'cage-1',
        'Under Maintenance',
        'token'
      )
    );
  });

  it('edits a cage label/size', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' } as never],
      error: null,
    });
    vi.mocked(hotelApi.getCageGrid).mockResolvedValue({
      data: { ...emptyGrid(), S: [AVAILABLE_CAGE as never] },
      error: null,
    });
    vi.mocked(hotelApi.updateCage).mockResolvedValue({
      data: { ...AVAILABLE_CAGE, cage_label: 'Makati-S-99' } as never,
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Makati-S-01')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const labelInput = screen.getByDisplayValue('Makati-S-01');
    await user.clear(labelInput);
    await user.type(labelInput, 'Makati-S-99');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(hotelApi.updateCage).toHaveBeenCalledWith(
        'cage-1',
        { cage_label: 'Makati-S-99', size: 'S' },
        'token'
      )
    );
  });
});
