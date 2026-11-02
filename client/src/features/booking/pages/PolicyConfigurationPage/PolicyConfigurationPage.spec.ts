import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as policyApi from '../../api/policy.api';
import type { PolicyConfiguration } from '../../booking.types';
import { PolicyConfigurationPage } from './PolicyConfigurationPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../api/policy.api', async () => {
  const actual = await vi.importActual<typeof import('../../api/policy.api')>(
    '../../api/policy.api'
  );
  return {
    ...actual,
    listPolicyConfigurations: vi.fn(),
    updatePolicyConfiguration: vi.fn(),
  };
});

function buildPolicy(
  overrides: Partial<PolicyConfiguration> = {}
): PolicyConfiguration {
  return {
    id: 'policy-default',
    branch_id: null,
    notice_period_days: 3,
    notice_enforcement_mode: 'Strict',
    notice_enforcement_enabled: true,
    booking_notice_period_days: 0,
    lunch_break_enabled: true,
    lunch_break_start: '12:00:00',
    lunch_break_end: '13:00:00',
    reschedule_fee_enabled: false,
    reschedule_fee_type: null,
    reschedule_fee_value: null,
    reschedule_free_allowance: null,
    credit_expiry_mode: 'rolling',
    credit_expiry_days: 30,
    credit_expiry_fixed_date: null,
    cancellation_credit_conversion_rate: 100,
    cancellation_grace_minutes: 60,
    downpayment_enabled: false,
    downpayment_type: null,
    downpayment_amount: null,
    downpayment_hold_hours: 24,
    pay_at_checkout_enabled: true,
    pay_at_checkout_grace_minutes: 10,
    max_concurrent_bookings_per_staff: 1,
    booking_group_email_mode: 'combined',
    care_log_task_email_enabled: false,
    care_log_daily_report_enabled: true,
    credit_review_mode: 'Automatic',
    customer_deactivation_auto_delete_days: 30,
    no_show_after_minutes: 30,
    no_show_at_closing: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
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
      null,
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(PolicyConfigurationPage)
      )
    )
  );
}

describe('PolicyConfigurationPage - no-show grace period (Branches > Configure > Policies)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });
    vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('shows the stored grace period in minutes by default, and the closing-hours checkbox unchecked', async () => {
    vi.mocked(policyApi.listPolicyConfigurations).mockResolvedValue({
      data: [buildPolicy({ no_show_after_minutes: 45, no_show_at_closing: false })],
      error: null,
    });

    renderPage();

    const numberInput = await screen.findByRole('spinbutton', {
      name: 'No-show grace period',
    });
    expect(numberInput).toHaveValue(45);
    expect(
      screen.getByRole('combobox', { name: 'No-show grace period unit' })
    ).toHaveValue('minutes');
    expect(
      screen.getByRole('checkbox', {
        name: "Auto-convert to no-show at the branch's closing hours",
      })
    ).not.toBeChecked();
  });

  it('shows an exact-hour grace period pre-converted into the hours unit', async () => {
    vi.mocked(policyApi.listPolicyConfigurations).mockResolvedValue({
      data: [buildPolicy({ no_show_after_minutes: 120 })],
      error: null,
    });

    renderPage();

    expect(
      await screen.findByRole('combobox', { name: 'No-show grace period unit' })
    ).toHaveValue('hours');
    expect(
      screen.getByRole('spinbutton', { name: 'No-show grace period' })
    ).toHaveValue(2);
  });

  it('switching the unit to hours converts the displayed number without changing the underlying minutes', async () => {
    vi.mocked(policyApi.listPolicyConfigurations).mockResolvedValue({
      data: [buildPolicy({ no_show_after_minutes: 90 })],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    const unitSelect = await screen.findByRole('combobox', {
      name: 'No-show grace period unit',
    });
    expect(screen.getByRole('spinbutton', { name: 'No-show grace period' })).toHaveValue(90);

    await user.selectOptions(unitSelect, 'hours');

    // 90 minutes is 1.5 hours; Math.round rounds half up to 2 once the unit
    // becomes hours.
    expect(screen.getByRole('spinbutton', { name: 'No-show grace period' })).toHaveValue(2);
  });

  it('entering a number while in hours mode saves it converted to minutes, and the checkbox saves independently', async () => {
    vi.mocked(policyApi.listPolicyConfigurations).mockResolvedValue({
      data: [buildPolicy({ no_show_after_minutes: 60, no_show_at_closing: false })],
      error: null,
    });
    vi.mocked(policyApi.updatePolicyConfiguration).mockResolvedValue({
      data: buildPolicy({ no_show_after_minutes: 180, no_show_at_closing: true }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    const numberInput = await screen.findByRole('spinbutton', {
      name: 'No-show grace period',
    });
    expect(
      await screen.findByRole('combobox', { name: 'No-show grace period unit' })
    ).toHaveValue('hours');

    await user.clear(numberInput);
    await user.type(numberInput, '3');

    const checkbox = screen.getByRole('checkbox', {
      name: "Auto-convert to no-show at the branch's closing hours",
    });
    await user.click(checkbox);

    await user.click(
      screen.getByRole('button', { name: 'Save policy configuration' })
    );

    await waitFor(() => {
      expect(policyApi.updatePolicyConfiguration).toHaveBeenCalled();
    });

    const payload = vi.mocked(policyApi.updatePolicyConfiguration).mock
      .calls[0][1];
    expect(payload.no_show_after_minutes).toBe(180);
    expect(payload.no_show_at_closing).toBe(true);
  });
});
