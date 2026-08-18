import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as maintenanceApi from '../../api/maintenance.api';
import type { ServiceType } from '../../maintenance.types';
import { AdminServiceTypesPage } from './AdminServiceTypesPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/maintenance.api', () => ({
  listBranches: vi.fn(),
  listServiceTypes: vi.fn(),
  createServiceType: vi.fn(),
  updateServiceType: vi.fn(),
  setServiceTypeBranchAvailability: vi.fn(),
}));

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati' },
  { id: 'branch-southwoods', name: 'Southwoods' },
];

function buildServiceType(overrides: Partial<ServiceType> = {}): ServiceType {
  return {
    id: 'type-1',
    key: 'grooming',
    name: 'Grooming',
    is_active: true,
    staff_picker_enabled: true,
    cage_picker_enabled: false,
    created_by: null,
    updated_by: null,
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
    service_type_branch_availability: [
      {
        service_type_id: 'type-1',
        branch_id: 'branch-makati',
        is_available: true,
      },
      {
        service_type_id: 'type-1',
        branch_id: 'branch-southwoods',
        is_available: true,
      },
    ],
    ...overrides,
  };
}

function buildViewer(role: StaffRole): StaffProfile {
  return {
    id: 'admin-1',
    branch_id: 'branch-makati',
    role,
    username: 'viewer',
    registered_email: 'viewer@example.com',
    display_name: 'Signed-in Viewer',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'admin-1', email: 'admin@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/admin/maintenance/service-types'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/service-types',
            element: createElement(AdminServiceTypesPage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('div', null, 'Staff profile page'),
          })
        )
      )
    )
  );
}

describe('AdminServiceTypesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: BRANCHES,
      error: null,
    });
    vi.mocked(maintenanceApi.listServiceTypes).mockResolvedValue({
      data: [buildServiceType()],
      error: null,
    });
  });

  it('redirects a non-Admin/Superadmin role to /staff/settings', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Groomer')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
    expect(maintenanceApi.listServiceTypes).not.toHaveBeenCalled();
  });

  it('Custom change (services/packages/service types actions menu): a row exposes Configure and Branch Availability behind a single "..." menu instead of an always-visible Rename button and toggle row', async () => {
    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Grooming')).closest(
      'li'
    ) as HTMLElement;

    expect(
      within(row).queryByRole('button', { name: 'Rename' })
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('switch', { name: /Staff picker/ })
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: 'Deactivate' })
    ).not.toBeInTheDocument();

    await user.click(
      within(row).getByRole('button', { name: 'Actions for Grooming' })
    );

    expect(
      screen.getByRole('menuitem', { name: 'Configure' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Branch Availability' })
    ).toBeInTheDocument();
  });

  it('Configure opens a modal to rename and adjust the staff/cage picker toggles, instead of an inline row that pushes the list down', async () => {
    vi.mocked(maintenanceApi.updateServiceType).mockResolvedValue({
      data: buildServiceType({
        name: 'Grooming & Spa',
        cage_picker_enabled: true,
      }),
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Grooming')).closest(
      'li'
    ) as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Grooming' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    const dialog = screen.getByRole('dialog', { name: 'Configure Grooming' });
    const nameInput = within(dialog).getByLabelText('Name');
    expect(nameInput).toHaveValue('Grooming');

    await user.clear(nameInput);
    await user.type(nameInput, 'Grooming & Spa');
    await user.click(
      within(dialog).getByRole('switch', { name: 'Cage picker enabled' })
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(maintenanceApi.updateServiceType).toHaveBeenCalledWith(
        'type-1',
        'token',
        {
          name: 'Grooming & Spa',
          staff_picker_enabled: true,
          cage_picker_enabled: true,
        }
      );
    });

    expect(await screen.findByText('Grooming & Spa')).toBeInTheDocument();
  });

  it('Custom change: Branch Availability opens a modal listing every branch, backed by a real per-branch table (not the shared is_active flag)', async () => {
    vi.mocked(
      maintenanceApi.setServiceTypeBranchAvailability
    ).mockResolvedValue({
      data: {
        service_type_id: 'type-1',
        branch_id: 'branch-southwoods',
        is_available: false,
      },
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    const row = (await screen.findByText('Grooming')).closest(
      'li'
    ) as HTMLElement;
    await user.click(
      within(row).getByRole('button', { name: 'Actions for Grooming' })
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'Branch Availability' })
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Branch Availability - Grooming',
    });
    const toggle = within(dialog).getByRole('switch', { name: 'Southwoods' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    await waitFor(() => {
      expect(
        maintenanceApi.setServiceTypeBranchAvailability
      ).toHaveBeenCalledWith('type-1', 'token', {
        branch_id: 'branch-southwoods',
        is_available: false,
      });
    });

    // Makati's own row is untouched - the two branches are independent.
    expect(
      within(dialog).getByRole('switch', { name: 'Makati' })
    ).toHaveAttribute('aria-checked', 'true');
  });
});
