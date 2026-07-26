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
import type { PromoCapConfiguration } from '../../maintenance.types';
import { PromoCapConfigurationPage } from './PromoCapConfigurationPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/maintenance.api', () => ({
  listBranches: vi.fn(),
  listPromoCapConfigurations: vi.fn(),
  upsertPromoCapConfiguration: vi.fn(),
}));

const BRANCHES = [
  { id: 'branch-makati', name: 'Makati', is_vet_branch: true },
  { id: 'branch-southwoods', name: 'Southwoods', is_vet_branch: false },
];

const CAP_CONFIGURATIONS: PromoCapConfiguration[] = [
  {
    id: 'cap-default',
    branch_id: null,
    cap_type: 'percentage',
    cap_value: 20,
    updated_by_staff_id: null,
    updated_at: '2026-07-26T00:00:00.000Z',
  },
  {
    id: 'cap-makati',
    branch_id: 'branch-makati',
    cap_type: 'flat',
    cap_value: 150,
    updated_by_staff_id: null,
    updated_at: '2026-07-26T00:00:00.000Z',
  },
];

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
      { initialEntries: ['/staff/admin/maintenance/promo-cap-configuration'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/promo-cap-configuration',
            element: createElement(PromoCapConfigurationPage),
          }),
          createElement(Route, {
            path: '/staff/profile',
            element: createElement('div', null, 'Staff profile page'),
          })
        )
      )
    )
  );
}

describe('PromoCapConfigurationPage', () => {
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
    vi.mocked(maintenanceApi.listPromoCapConfigurations).mockResolvedValue({
      data: CAP_CONFIGURATIONS,
      error: null,
    });
  });

  it('redirects a non-Admin/Superadmin role to /staff/profile', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
    expect(maintenanceApi.listPromoCapConfigurations).not.toHaveBeenCalled();
  });

  it('renders one independent card per branch plus the system-wide default', async () => {
    renderPage();

    expect(
      await screen.findByText('Both branches (system-wide default)')
    ).toBeInTheDocument();
    expect(screen.getByText('Makati')).toBeInTheDocument();
    expect(screen.getByText('Southwoods')).toBeInTheDocument();

    // Makati already has a saved flat cap; Southwoods has none yet.
    const southwoodsCard = screen.getByText('Southwoods').closest('article');
    expect(southwoodsCard).not.toBeNull();
    expect(
      screen.getByText(/No cap saved yet/, { selector: 'p' })
    ).toBeInTheDocument();
  });

  it('saves a branch cap independently of the default cap', async () => {
    vi.mocked(maintenanceApi.upsertPromoCapConfiguration).mockResolvedValue({
      data: { ...CAP_CONFIGURATIONS[1], cap_value: 300 },
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByText('Makati');
    const makatiCard = screen.getByText('Makati').closest('article') as HTMLElement;
    const valueInput = within(makatiCard).getByLabelText('Cap value (PHP)');
    await user.clear(valueInput);
    await user.type(valueInput, '300');
    await user.click(within(makatiCard).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(maintenanceApi.upsertPromoCapConfiguration).toHaveBeenCalledWith(
        'token',
        { branch_id: 'branch-makati', cap_type: 'flat', cap_value: 300 }
      );
    });

    expect(await screen.findByText('Promo cap updated.')).toBeInTheDocument();
  });
});
