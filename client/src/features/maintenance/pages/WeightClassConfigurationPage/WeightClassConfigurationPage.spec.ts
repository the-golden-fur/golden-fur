import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as maintenanceApi from '../../api/maintenance.api';
import type { PetWeightClassConfiguration } from '../../maintenance.types';
import { WeightClassConfigurationPage } from './WeightClassConfigurationPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/maintenance.api', () => ({
  getPetWeightClassConfiguration: vi.fn(),
  updatePetWeightClassConfiguration: vi.fn(),
}));

const CONFIGURATION: PetWeightClassConfiguration = {
  id: 'weight-class-config-1',
  m_min_kg: 5,
  l_min_kg: 15,
  xl_min_kg: 30,
  min_weight_kg: 0.1,
  max_weight_kg: 156,
  updated_by_staff_id: null,
  updated_at: '2026-07-26T00:00:00.000Z',
};

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
      { initialEntries: ['/staff/admin/maintenance/weight-classes'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/weight-classes',
            element: createElement(WeightClassConfigurationPage),
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

describe('WeightClassConfigurationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(maintenanceApi.getPetWeightClassConfiguration).mockResolvedValue({
      data: CONFIGURATION,
      error: null,
    });
  });

  it('is Superadmin-only: redirects an Admin to /staff/settings, since weight classes affect every branch at once', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
    expect(
      maintenanceApi.getPetWeightClassConfiguration
    ).not.toHaveBeenCalled();
  });

  it('allows a Superadmin to view the configuration', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Weight Classes')).toBeInTheDocument();
  });

  it('pet weight limits: a Superadmin can set the allowed weight range', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });
    vi.mocked(
      maintenanceApi.updatePetWeightClassConfiguration
    ).mockResolvedValue({
      data: { ...CONFIGURATION, max_weight_kg: 100 },
      error: null,
    });

    renderPage();

    const maxInput = await screen.findByLabelText(
      'Heaviest allowed weight (kg)'
    );
    expect(screen.getByLabelText('Lightest allowed weight (kg)')).toHaveValue(
      0.1
    );
    expect(maxInput).toHaveValue(156);

    fireEvent.change(maxInput, { target: { value: '100' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save weight classes' })
    );

    expect(
      await screen.findByText('Weight class configuration updated.')
    ).toBeInTheDocument();
    expect(
      maintenanceApi.updatePetWeightClassConfiguration
    ).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ min_weight_kg: 0.1, max_weight_kg: 100 })
    );
  });

  it('pet weight limits: refuses a heaviest weight at or below the XL cut-off', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });

    renderPage();

    const maxInput = await screen.findByLabelText(
      'Heaviest allowed weight (kg)'
    );
    fireEvent.change(maxInput, { target: { value: '25' } }); // XL is 30
    fireEvent.submit(maxInput.closest('form') as HTMLFormElement);

    expect(
      await screen.findByText(
        /heaviest allowed weight must be above the XL cut-off/
      )
    ).toBeInTheDocument();
    expect(
      maintenanceApi.updatePetWeightClassConfiguration
    ).not.toHaveBeenCalled();
  });
});
