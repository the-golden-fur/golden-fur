import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getSupabaseClient } from '../../../../../shared/auth/api/auth.api';
import type { StaffProfile } from '../../../staff.types';
import { StaffCard } from './StaffCard';

vi.mock('../../../../../shared/auth/api/auth.api', () => ({
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
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('StaffCard', () => {
  it('renders correctly from only staffId + fetched profile data', async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);

    render(
      createElement(StaffCard, {
        staffId: 'staff-1',
        profile: buildProfile(),
      })
    );

    expect(screen.getByText('Jamie Cruz')).toBeInTheDocument();
    expect(screen.getByText('Groomer')).toBeInTheDocument();
    expect(screen.getByText('JC')).toBeInTheDocument();
    expect(
      await screen.findByText('Unable to check availability')
    ).toBeInTheDocument();
  });

  it('renders the avatar image instead of initials when a photo URL is present', () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);

    render(
      createElement(StaffCard, {
        staffId: 'staff-1',
        profile: buildProfile({
          profile_photo_url: 'https://cdn.example.com/avatar.png',
        }),
      })
    );

    expect(
      screen.getByRole('img', { name: /jamie cruz's avatar/i })
    ).toHaveAttribute('src', 'https://cdn.example.com/avatar.png');
  });

  it('renders the branch name when provided', () => {
    vi.mocked(getSupabaseClient).mockReturnValue(null);

    render(
      createElement(StaffCard, {
        staffId: 'staff-1',
        profile: buildProfile(),
        branchName: 'Downtown Branch',
      })
    );

    expect(screen.getByText('Downtown Branch')).toBeInTheDocument();
  });
});
