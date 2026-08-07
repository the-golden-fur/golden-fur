import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as maintenanceApi from '../../api/maintenance.api';
import type { PricingConfiguration } from '../../maintenance.types';
import { PricingConfigurationPage } from './PricingConfigurationPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../api/maintenance.api', () => ({
  getPricingConfiguration: vi.fn(),
  updatePricingConfiguration: vi.fn(),
}));

const CONFIGURATION: PricingConfiguration = {
  id: 'pricing-config-1',
  size_s_rule_type: 'multiplier',
  size_s_rule_value: 1,
  size_m_rule_type: 'multiplier',
  size_m_rule_value: 1.1,
  size_l_rule_type: 'multiplier',
  size_l_rule_value: 1.25,
  size_xl_rule_type: 'multiplier',
  size_xl_rule_value: 1.5,
  coat_long_rule_type: 'flat',
  coat_long_rule_value: 0,
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
      { initialEntries: ['/staff/admin/maintenance/pricing-configuration'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/pricing-configuration',
            element: createElement(PricingConfigurationPage),
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

describe('PricingConfigurationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });
    vi.mocked(maintenanceApi.getPricingConfiguration).mockResolvedValue({
      data: CONFIGURATION,
      error: null,
    });
  });

  it('#81 AC-5: redirects a non-Admin/Superadmin role to /staff/settings', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Groomer')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
    expect(maintenanceApi.getPricingConfiguration).not.toHaveBeenCalled();
  });

  it('Custom change (configurable pricing rules) AC-1: loads and displays each size/coat rule, full names', async () => {
    renderPage();

    expect(await screen.findByLabelText('Small size type')).toHaveValue(
      'multiplier'
    );
    expect(screen.getByLabelText('Small size value')).toHaveValue(1);
    expect(screen.getByLabelText('Medium size value')).toHaveValue(1.1);
    expect(screen.getByLabelText('Long coat type')).toHaveValue('flat');
    expect(screen.getByLabelText('Long coat value')).toHaveValue(0);
  });

  it('Custom change (configurable pricing rules) AC-2: saving an updated rule value updates the derived preview', async () => {
    vi.mocked(maintenanceApi.updatePricingConfiguration).mockResolvedValue({
      data: { ...CONFIGURATION, coat_long_rule_value: 50 },
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByLabelText('Small size value');

    const addonInput = screen.getByLabelText('Long coat value');
    await user.clear(addonInput);
    await user.type(addonInput, '50');

    await user.click(
      screen.getByRole('button', { name: 'Save pricing configuration' })
    );

    await waitFor(() => {
      expect(maintenanceApi.updatePricingConfiguration).toHaveBeenCalledWith(
        'token',
        {
          size_s_rule_type: 'multiplier',
          size_s_rule_value: 1,
          size_m_rule_type: 'multiplier',
          size_m_rule_value: 1.1,
          size_l_rule_type: 'multiplier',
          size_l_rule_value: 1.25,
          size_xl_rule_type: 'multiplier',
          size_xl_rule_value: 1.5,
          coat_long_rule_type: 'flat',
          coat_long_rule_value: 50,
        }
      );
    });

    expect(
      await screen.findByText('Pricing configuration updated.')
    ).toBeInTheDocument();
  });

  it('Custom change (configurable pricing rules): changing a rule type to Percentage still saves a valid (zero-allowed) value', async () => {
    vi.mocked(maintenanceApi.updatePricingConfiguration).mockResolvedValue({
      data: {
        ...CONFIGURATION,
        coat_long_rule_type: 'percentage',
        coat_long_rule_value: 0,
      },
      error: null,
    });

    renderPage();
    const user = userEvent.setup();

    await screen.findByLabelText('Long coat type');

    await user.selectOptions(
      screen.getByLabelText('Long coat type'),
      'percentage'
    );

    await user.click(
      screen.getByRole('button', { name: 'Save pricing configuration' })
    );

    await waitFor(() => {
      expect(maintenanceApi.updatePricingConfiguration).toHaveBeenCalledWith(
        'token',
        expect.objectContaining({ coat_long_rule_type: 'percentage' })
      );
    });
  });
});
