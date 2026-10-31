import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as maintenanceApi from '../../api/maintenance.api';
import type { PetAgeConfiguration } from '../../maintenance.types';
import { PetAgeLimitPage } from './PetAgeLimitPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/maintenance.api', () => ({
  getPetAgeConfiguration: vi.fn(),
  updatePetAgeConfiguration: vi.fn(),
}));

const CONFIGURATION: PetAgeConfiguration = {
  id: 'pet-age-config-1',
  max_age_years: 38,
  updated_by_staff_id: null,
  updated_at: '2026-10-30T00:00:00.000Z',
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
      { initialEntries: ['/staff/admin/maintenance/pets'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/pets',
            element: createElement(PetAgeLimitPage),
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

describe('PetAgeLimitPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(maintenanceApi.getPetAgeConfiguration).mockResolvedValue({
      data: CONFIGURATION,
      error: null,
    });
  });

  it('redirects a non-admin role to /staff/settings', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Receptionist')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
    expect(maintenanceApi.getPetAgeConfiguration).not.toHaveBeenCalled();
  });

  it('lets an Admin save a lower limit', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });
    vi.mocked(maintenanceApi.updatePetAgeConfiguration).mockResolvedValue({
      data: { ...CONFIGURATION, max_age_years: 25 },
      error: null,
    });

    renderPage();

    const input = await screen.findByLabelText(/Maximum pet age/);
    expect(input).toHaveValue(38);

    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save age limit' }));

    expect(
      await screen.findByText('Pet age limit updated.')
    ).toBeInTheDocument();
    expect(maintenanceApi.updatePetAgeConfiguration).toHaveBeenCalledWith(
      'token',
      { max_age_years: 25 }
    );
  });

  it('never allows more than the 38-year record', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });

    renderPage();

    const input = await screen.findByLabelText(/Maximum pet age/);
    expect(input).toHaveAttribute('max', '38');

    fireEvent.change(input, { target: { value: '39' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(
      await screen.findByText('Enter a whole number of years from 1 to 38.')
    ).toBeInTheDocument();
    expect(maintenanceApi.updatePetAgeConfiguration).not.toHaveBeenCalled();
  });
});
