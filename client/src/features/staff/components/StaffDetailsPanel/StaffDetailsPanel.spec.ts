import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../../../../shared/auth/api/auth.api';
import type { StaffProfile } from '../../staff.types';
import { StaffDetailsPanel } from './StaffDetailsPanel';

vi.mock('../../../../shared/auth/api/auth.api', () => ({
  getSupabaseClient: vi.fn(),
}));

function buildProfile(overrides: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-1',
    role: 'Groomer',
    username: 'jcruz',
    registered_email: 'jcruz@example.com',
    display_name: 'Jamie Cruz',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    archived_at: null,
    created_at: '2026-01-15T00:00:00.000Z',
    updated_at: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

function renderPanel(
  overrides: Partial<StaffProfile> = {},
  handlers: { onSetDaysOff?: () => void; onManageAccount?: () => void } = {}
) {
  vi.mocked(getSupabaseClient).mockReturnValue(null);

  return render(
    createElement(StaffDetailsPanel, {
      profile: buildProfile(overrides),
      branchName: 'Makati',
      accessToken: 'token',
      onSetDaysOff: handlers.onSetDaysOff ?? vi.fn(),
      onManageAccount: handlers.onManageAccount ?? vi.fn(),
    })
  );
}

function detailValue(label: string) {
  return screen.getByText(label).nextElementSibling;
}

describe('StaffDetailsPanel', () => {
  it('shows full name, email, username, role, branch and account status', () => {
    renderPanel();

    expect(detailValue('Full name')).toHaveTextContent('Jamie Cruz');
    expect(detailValue('Email')).toHaveTextContent('jcruz@example.com');
    expect(detailValue('Username')).toHaveTextContent('jcruz');
    expect(detailValue('Role')).toHaveTextContent('Groomer');
    expect(detailValue('Branch')).toHaveTextContent('Makati');
    expect(detailValue('Account status')).toHaveTextContent('Active');
  });

  it('shows a dash for contact details that were never filled in', () => {
    renderPanel();

    expect(detailValue('Contact number')).toHaveTextContent('—');
    expect(detailValue('Emergency contact')).toHaveTextContent('—');
    expect(detailValue('Preferred communication')).toHaveTextContent('—');
  });

  it('shows filled-in contact details, joining the emergency contact name and number', () => {
    renderPanel({
      phone_number: '09171234567',
      emergency_contact_name: 'Pat Cruz',
      emergency_contact_number: '09179876543',
      preferred_communication_channel: 'Viber',
    });

    expect(detailValue('Contact number')).toHaveTextContent('09171234567');
    expect(detailValue('Emergency contact')).toHaveTextContent(
      'Pat Cruz · 09179876543'
    );
    expect(detailValue('Preferred communication')).toHaveTextContent('Viber');
  });

  it('marks a deactivated account as Inactive', () => {
    renderPanel({ is_active: false });

    expect(detailValue('Account status')).toHaveTextContent('Inactive');
  });

  it('calls the matching handler from each footer action', async () => {
    const onSetDaysOff = vi.fn();
    const onManageAccount = vi.fn();
    renderPanel({}, { onSetDaysOff, onManageAccount });

    await userEvent.click(
      screen.getByRole('button', { name: 'Set day(s) off' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Manage account' })
    );

    expect(onSetDaysOff).toHaveBeenCalledTimes(1);
    expect(onManageAccount).toHaveBeenCalledTimes(1);
  });
});
