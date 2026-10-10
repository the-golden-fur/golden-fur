import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as vetApi from '../../api/veterinary.api';
import { VetServicesConfigurationPage } from './VetServicesConfigurationPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/veterinary.api', () => ({
  listServiceCatalog: vi.fn(),
  createServiceCatalogItem: vi.fn(),
  updateServiceCatalogItem: vi.fn(),
  deleteServiceCatalogItem: vi.fn(),
}));

function buildViewer(role: StaffRole): StaffProfile {
  return {
    id: 'staff-1',
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
    user: { id: 'staff-1', email: 'staff@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/admin/maintenance/veterinary-services'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/veterinary-services',
            element: createElement(VetServicesConfigurationPage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: 'Settings page',
          })
        )
      )
    )
  );
}

describe('VetServicesConfigurationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vetApi.listServiceCatalog).mockResolvedValue({
      data: [
        {
          id: 'svc-1',
          name: 'Deworming',
          default_price: 350,
          created_by: 'vet-1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    });
  });

  it('shows a Superadmin the vet procedure list', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Veterinary Services' })
    ).toBeInTheDocument();
    expect(await screen.findByText('Deworming')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add service' })
    ).toBeInTheDocument();
    // The vet-facing tab copy is replaced by this page's own header.
    expect(screen.queryByText(/Suggested when you list/)).toBeNull();
  });

  it.each<StaffRole>(['Admin', 'Veterinarian'])(
    'redirects a %s to Settings',
    async (role) => {
      vi.mocked(staffApi.listStaff).mockResolvedValue({
        data: [buildViewer(role)],
        error: null,
      });

      renderPage();

      expect(await screen.findByText('Settings page')).toBeInTheDocument();
      expect(vetApi.listServiceCatalog).not.toHaveBeenCalled();
    }
  );
});
