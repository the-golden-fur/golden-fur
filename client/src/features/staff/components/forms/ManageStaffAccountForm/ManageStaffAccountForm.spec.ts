import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as staffApi from '../../../api/staff.api';
import { ManageStaffAccountForm } from './ManageStaffAccountForm';
import type { StaffProfile } from '../../../staff.types';

vi.mock('../../../api/staff.api', () => ({
  manageStaffAccount: vi.fn(),
}));

function baseProfile(overrides: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: 'staff-2',
    branch_id: 'branch-a',
    role: 'Groomer',
    username: 'groomer.one',
    registered_email: 'groomer.one@goldenfur.com',
    display_name: 'Groomer One',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderForm(
  overrides: {
    viewerRole?: StaffProfile['role'];
    profile?: StaffProfile;
    onUpdated?: (updated: StaffProfile) => void;
  } = {}
) {
  const onUpdated = overrides.onUpdated ?? vi.fn();

  render(
    createElement(ManageStaffAccountForm, {
      staffId: 'staff-2',
      profile: overrides.profile ?? baseProfile(),
      viewerRole: overrides.viewerRole ?? 'Superadmin',
      branchOptions: ['branch-a', 'branch-b'],
      accessToken: 'token',
      onUpdated,
    })
  );

  return { onUpdated };
}

describe('ManageStaffAccountForm', () => {
  it('hides the role/branch fields for an Admin viewer (Superadmin-only, M01 Process 5)', () => {
    renderForm({ viewerRole: 'Admin' });

    expect(screen.queryByLabelText(/change role to/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/change branch to/i)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /deactivate account/i })
    ).toBeInTheDocument();
  });

  it('shows the role/branch fields for a Superadmin viewer and saves a role change', async () => {
    const onUpdated = vi.fn();
    vi.mocked(staffApi.manageStaffAccount).mockResolvedValue({
      data: baseProfile({ role: 'Supervisor' }),
      error: null,
    });
    renderForm({ onUpdated });

    await userEvent.selectOptions(
      screen.getByLabelText(/change role to/i),
      'Supervisor'
    );
    await userEvent.click(
      screen.getByRole('button', { name: /save role\/branch/i })
    );

    expect(staffApi.manageStaffAccount).toHaveBeenCalledWith(
      'staff-2',
      'token',
      { role: 'Supervisor' }
    );
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'Supervisor' })
    );
  });

  it('shows an error instead of calling the API when nothing changed', async () => {
    renderForm();

    await userEvent.click(
      screen.getByRole('button', { name: /save role\/branch/i })
    );

    expect(
      await screen.findByText(/no changes to save/i)
    ).toBeInTheDocument();
    expect(staffApi.manageStaffAccount).not.toHaveBeenCalled();
  });

  it('deactivates an active account', async () => {
    const onUpdated = vi.fn();
    vi.mocked(staffApi.manageStaffAccount).mockResolvedValue({
      data: baseProfile({ is_active: false }),
      error: null,
    });
    renderForm({ onUpdated });

    await userEvent.click(
      screen.getByRole('button', { name: /deactivate account/i })
    );

    expect(staffApi.manageStaffAccount).toHaveBeenCalledWith(
      'staff-2',
      'token',
      { is_active: false }
    );
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false })
    );
  });

  it('reactivates a deactivated account', async () => {
    vi.mocked(staffApi.manageStaffAccount).mockResolvedValue({
      data: baseProfile({ is_active: true }),
      error: null,
    });
    renderForm({ profile: baseProfile({ is_active: false }) });

    await userEvent.click(
      screen.getByRole('button', { name: /reactivate account/i })
    );

    expect(staffApi.manageStaffAccount).toHaveBeenCalledWith(
      'staff-2',
      'token',
      { is_active: true }
    );
  });

  it('surfaces the server error message on failure', async () => {
    vi.mocked(staffApi.manageStaffAccount).mockResolvedValue({
      data: null,
      error: 'Only a Superadmin can change staff role or branch',
    });
    renderForm({ viewerRole: 'Admin' });

    await userEvent.click(
      screen.getByRole('button', { name: /deactivate account/i })
    );

    expect(
      await screen.findByText(
        /only a superadmin can change staff role or branch/i
      )
    ).toBeInTheDocument();
  });
});
