import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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

// Custom change (cage pet-type support): default resolved value so every
// existing test sees the two seeded pet types without its own setup,
// mirroring how CustomerBookingFlowPage.spec.ts defaults listServiceTypes.
vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listPetTypes: vi.fn().mockResolvedValue({
    data: [
      { id: 'pt-dog', key: 'Dog', name: 'Dog', is_active: true },
      { id: 'pt-cat', key: 'Cat', name: 'Cat', is_active: true },
    ],
    error: null,
  }),
  // Custom change (Superadmin cage branch reassignment): only fetched when
  // the viewer is Superadmin - defaulted here so those tests don't each
  // need their own setup.
  listBranches: vi.fn().mockResolvedValue({
    data: [
      { id: 'branch-1', name: 'Makati', is_vet_branch: false },
      { id: 'branch-2', name: 'Southwoods', is_vet_branch: false },
    ],
    error: null,
  }),
}));

vi.mock('../../api/hotel.api', () => ({
  getCageGrid: vi.fn(),
  createCage: vi.fn(),
  updateCage: vi.fn(),
  archiveCage: vi.fn(),
  setCageMaintenanceStatus: vi.fn(),
}));

const AVAILABLE_CAGE = {
  id: 'cage-1',
  branch_id: 'branch-1',
  cage_label: 'Makati-S-01',
  size: 'S',
  status: 'Available',
  pet_types: ['Dog', 'Cat'],
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
        screen.getByRole('button', { name: 'Add cage' })
      ).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'Add cage' }));

    const dialog = screen.getByRole('dialog', { name: 'Add cage' });
    await user.type(
      within(dialog).getByPlaceholderText('e.g. Makati-S-03'),
      'Makati-S-01'
    );
    await user.click(within(dialog).getByRole('checkbox', { name: 'Dog' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add cage' }));

    await waitFor(() =>
      expect(hotelApi.createCage).toHaveBeenCalledWith(
        'Makati-S-01',
        'S',
        ['Dog'],
        'token'
      )
    );
    expect(await screen.findByText('Cage added.')).toBeInTheDocument();
    // The modal closes on success - the form no longer sits on the page.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Custom change (cage pet-type support): blocks submitting the create form with no pet type selected', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' } as never],
      error: null,
    });
    vi.mocked(hotelApi.getCageGrid).mockResolvedValue({
      data: emptyGrid(),
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add cage' })
      ).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'Add cage' }));

    const dialog = screen.getByRole('dialog', { name: 'Add cage' });
    await user.type(
      within(dialog).getByPlaceholderText('e.g. Makati-S-03'),
      'Makati-S-01'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add cage' }));

    expect(
      await screen.findByText('Select at least one pet type.')
    ).toBeInTheDocument();
    expect(hotelApi.createCage).not.toHaveBeenCalled();
  });

  it('custom change: row actions live behind a single "..." menu (Configure / Rename / Archive), and Archive is left out for an Occupied cage instead of shown disabled', async () => {
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
    vi.mocked(hotelApi.archiveCage).mockResolvedValue({
      data: true,
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Makati-S-01')).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: 'Archive' })
    ).not.toBeInTheDocument();

    // Occupied cage: no Archive item at all (not just disabled), but the
    // rest of the consistent Configure / Rename core is still offered.
    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati-M-01' })
    );
    expect(
      screen.queryByRole('menuitem', { name: 'Archive' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Configure' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Rename' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Delete' })
    ).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    // Available cage: Archive is offered, asks for confirmation, then works.
    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati-S-01' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    expect(hotelApi.archiveCage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(hotelApi.archiveCage).toHaveBeenCalledWith('cage-1', 'token')
    );
    await waitFor(() =>
      expect(screen.queryByText('Makati-S-01')).not.toBeInTheDocument()
    );
  });

  it('renames a cage from the "..." menu without touching size or pet types', async () => {
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
      data: { ...AVAILABLE_CAGE, cage_label: 'Makati-S-77' } as never,
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Makati-S-01')).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati-S-01' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByRole('textbox', { name: /new cage name/i });
    await user.clear(input);
    await user.type(input, 'Makati-S-77');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(hotelApi.updateCage).toHaveBeenCalledWith(
        'cage-1',
        { cage_label: 'Makati-S-77' },
        'token'
      )
    );
    expect(await screen.findByText('Makati-S-77')).toBeInTheDocument();
  });

  it('toggles Under Maintenance from the "..." menu', async () => {
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
        screen.getByRole('button', { name: 'Actions for Makati-S-01' })
      ).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati-S-01' })
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'Mark Under Maintenance' })
    );

    await waitFor(() =>
      expect(hotelApi.setCageMaintenanceStatus).toHaveBeenCalledWith(
        'cage-1',
        'Under Maintenance',
        'token'
      )
    );
  });

  it('Configure opens a modal (not an inline row edit) to change label, size and pet types', async () => {
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
    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati-S-01' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    const dialog = screen.getByRole('dialog', { name: 'Configure cage' });
    // The row itself is not turned into inputs any more.
    expect(within(dialog).getByLabelText('Cage label')).toHaveValue(
      'Makati-S-01'
    );
    expect(within(dialog).getByLabelText('Size')).toHaveValue('S');

    const labelInput = within(dialog).getByLabelText('Cage label');
    await user.clear(labelInput);
    await user.type(labelInput, 'Makati-S-99');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );

    await waitFor(() =>
      expect(hotelApi.updateCage).toHaveBeenCalledWith(
        'cage-1',
        { cage_label: 'Makati-S-99', size: 'S', pet_types: ['Dog', 'Cat'] },
        'token'
      )
    );
  });

  it('searching narrows the visible cages', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' } as never],
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

    renderPage();
    await screen.findByText('Makati-S-01');
    expect(screen.getByText('Makati-M-01')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search cages...'), 'S-01');

    expect(screen.getByText('Makati-S-01')).toBeInTheDocument();
    expect(screen.queryByText('Makati-M-01')).not.toBeInTheDocument();
  });

  it('adding a Size filter tile narrows the visible cages', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' } as never],
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

    renderPage();
    await screen.findByText('Makati-S-01');

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('menuitem', { name: 'Size' }));

    // Size's default value is the first size option ('S').
    expect(
      screen.getByRole('button', { name: /Size: Small/ })
    ).toBeInTheDocument();
    expect(screen.getByText('Makati-S-01')).toBeInTheDocument();
    expect(screen.queryByText('Makati-M-01')).not.toBeInTheDocument();
  });

  it('switches to List view and still shows every cage', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' } as never],
      error: null,
    });
    vi.mocked(hotelApi.getCageGrid).mockResolvedValue({
      data: { ...emptyGrid(), S: [AVAILABLE_CAGE as never] },
      error: null,
    });

    renderPage();
    await screen.findByText('Makati-S-01');

    await user.click(screen.getByRole('button', { name: 'List' }));

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('Makati-S-01')).toBeInTheDocument();
  });

  it('switches to Board view, grouped by Status by default', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' } as never],
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

    const { container } = renderPage();
    await screen.findByText('Makati-S-01');

    await user.click(screen.getByRole('button', { name: 'Board' }));

    // One column per CageStatus (Available, Occupied, Reserved, Under
    // Maintenance), each cage under its own status column.
    expect(
      container.querySelectorAll('section:not([aria-labelledby])')
    ).toHaveLength(4);
    expect(screen.getByText('Makati-S-01')).toBeInTheDocument();
    expect(screen.getByText('Makati-M-01')).toBeInTheDocument();

    // Re-grouping by Size (S, M, L, XL) still shows both cages.
    await user.selectOptions(screen.getByLabelText('Group by'), 'size');
    expect(
      container.querySelectorAll('section:not([aria-labelledby])')
    ).toHaveLength(4);
    expect(screen.getByText('Makati-S-01')).toBeInTheDocument();
    expect(screen.getByText('Makati-M-01')).toBeInTheDocument();
  });

  it('custom change: Board view hides the "..." button, replacing it with a right-click/long-press menu', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Admin' } as never],
      error: null,
    });
    vi.mocked(hotelApi.getCageGrid).mockResolvedValue({
      data: { ...emptyGrid(), S: [AVAILABLE_CAGE as never] },
      error: null,
    });

    renderPage();
    await screen.findByText('Makati-S-01');

    // Table view: the "..." trigger is visible.
    expect(
      screen.getByRole('button', { name: 'Actions for Makati-S-01' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Board' }));

    expect(
      screen.queryByRole('button', { name: 'Actions for Makati-S-01' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Makati-S-01'));

    expect(
      screen.getByRole('menuitem', { name: 'Configure' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Mark Under Maintenance' })
    ).toBeInTheDocument();
  });

  it('Configure keeps the modal open with an error when no pet type is selected', async () => {
    const user = userEvent.setup();
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
    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati-S-01' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    const dialog = screen.getByRole('dialog', { name: 'Configure cage' });
    for (const box of within(dialog).getAllByRole('checkbox')) {
      if ((box as HTMLInputElement).checked) await user.click(box);
    }
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );

    expect(
      await within(dialog).findByText('Select at least one pet type.')
    ).toBeInTheDocument();
    expect(hotelApi.updateCage).not.toHaveBeenCalled();
  });

  it('Custom change (Superadmin cage branch reassignment): a non-Superadmin never sees a Branch field in Configure', async () => {
    const user = userEvent.setup();
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
    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati-S-01' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    const dialog = screen.getByRole('dialog', { name: 'Configure cage' });
    expect(within(dialog).queryByLabelText('Branch')).not.toBeInTheDocument();
  });

  it('Custom change (Superadmin cage branch reassignment): Superadmin can reassign a cage, which then disappears from the current list', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [{ id: 'staff-1', role: 'Superadmin' } as never],
      error: null,
    });
    vi.mocked(hotelApi.getCageGrid).mockResolvedValue({
      data: { ...emptyGrid(), S: [AVAILABLE_CAGE as never] },
      error: null,
    });
    vi.mocked(hotelApi.updateCage).mockResolvedValue({
      data: { ...AVAILABLE_CAGE, branch_id: 'branch-2' } as never,
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Makati-S-01')).toBeInTheDocument()
    );
    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati-S-01' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    const dialog = screen.getByRole('dialog', { name: 'Configure cage' });
    const branchSelect = within(dialog).getByLabelText('Branch');
    expect(branchSelect).toHaveValue('branch-1');

    await user.selectOptions(branchSelect, 'branch-2');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );

    await waitFor(() =>
      expect(hotelApi.updateCage).toHaveBeenCalledWith(
        'cage-1',
        {
          cage_label: 'Makati-S-01',
          size: 'S',
          pet_types: ['Dog', 'Cat'],
          branch_id: 'branch-2',
        },
        'token'
      )
    );
    expect(
      await screen.findByText('Cage moved to Southwoods.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Makati-S-01')).not.toBeInTheDocument();
  });
});
