import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../api/staff.api';
import type { StaffProfile, UnavailabilityBlock } from '../../staff.types';
import { MySchedulePage } from './MySchedulePage';

vi.mock('../../api/staff.api', () => ({
  getStaffProfile: vi.fn(),
  listUnavailabilityBlocks: vi.fn(),
}));

const PROFILE: StaffProfile = {
  id: 'staff-1',
  branch_id: 'branch-makati',
  role: 'Groomer',
  username: 'groomer1',
  registered_email: 'groomer1@example.com',
  display_name: 'Groomer One',
  profile_photo_url: null,
  phone_number: null,
  emergency_contact_name: null,
  emergency_contact_number: null,
  preferred_communication_channel: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

// Dated relative to the real current month (rather than mocking the system
// clock, which hangs @testing-library's findBy*/waitFor polling under
// vitest's fake timers) - the 15th is always a valid day in every month, so
// the page's own "defaults to the current month" view always includes it.
const now = new Date();
const MID_MONTH_START = new Date(
  now.getFullYear(),
  now.getMonth(),
  15
).toISOString();
const MID_MONTH_END = new Date(
  now.getFullYear(),
  now.getMonth(),
  16
).toISOString();

function buildBlock(
  overrides: Partial<UnavailabilityBlock> = {}
): UnavailabilityBlock {
  return {
    id: 'block-1',
    staff_id: 'staff-1',
    start_time: MID_MONTH_START,
    end_time: MID_MONTH_END,
    reason: null,
    created_by: 'admin-1',
    created_at: MID_MONTH_START,
    status: 'approved',
    is_quick_action: false,
    is_full_day: true,
    reviewed_by: null,
    reviewed_at: null,
    denial_reason: null,
    requested_reviewer_id: null,
    leave_type: 'Rest Day',
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'groomer1@example.com' },
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
        createElement(MySchedulePage)
      )
    )
  );
}

describe('MySchedulePage', () => {
  it("loads the staff member's own profile and shows their schedule entries as chips", async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: PROFILE,
      error: null,
    });
    vi.mocked(staffApi.listUnavailabilityBlocks).mockResolvedValue({
      data: [buildBlock()],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Rest Day')).toBeInTheDocument();
    expect(staffApi.listUnavailabilityBlocks).toHaveBeenCalledWith(
      'staff-1',
      'token',
      expect.objectContaining({
        from: expect.any(String),
        to: expect.any(String),
      })
    );
  });

  it('clicking a chip shows the entry detail, including a non-approved status', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: PROFILE,
      error: null,
    });
    vi.mocked(staffApi.listUnavailabilityBlocks).mockResolvedValue({
      data: [
        buildBlock({
          leave_type: 'Vacation Leave',
          status: 'pending',
          reason: 'Family trip',
        }),
      ],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Vacation Leave (pending)'));

    expect(await screen.findByText('Status: pending')).toBeInTheDocument();
    expect(screen.getByText('Reason: Family trip')).toBeInTheDocument();
  });

  it('month navigation re-fetches with a new date range', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: PROFILE,
      error: null,
    });
    vi.mocked(staffApi.listUnavailabilityBlocks).mockResolvedValue({
      data: [],
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(staffApi.listUnavailabilityBlocks).toHaveBeenCalledTimes(1)
    );

    await user.click(screen.getByLabelText('Next month'));

    await waitFor(() =>
      expect(staffApi.listUnavailabilityBlocks).toHaveBeenCalledTimes(2)
    );

    const [, , firstRange] = vi.mocked(staffApi.listUnavailabilityBlocks).mock
      .calls[0];
    const [, , secondRange] = vi.mocked(staffApi.listUnavailabilityBlocks).mock
      .calls[1];
    expect(secondRange).not.toEqual(firstRange);
  });

  it('links to the Days Off request page', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: PROFILE,
      error: null,
    });
    vi.mocked(staffApi.listUnavailabilityBlocks).mockResolvedValue({
      data: [],
      error: null,
    });

    renderPage();

    const link = await screen.findByRole('link', {
      name: 'Request a day off',
    });
    expect(link).toHaveAttribute('href', '/staff/days-off');
  });

  it('shows an error state when the profile fails to load', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: null,
      error: 'Could not load your profile.',
    });

    renderPage();

    expect(
      await screen.findByText('Could not load your profile.')
    ).toBeInTheDocument();
  });

  it('shows an error state when the schedule fails to load', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: PROFILE,
      error: null,
    });
    vi.mocked(staffApi.listUnavailabilityBlocks).mockResolvedValue({
      data: null,
      error: 'Could not load your schedule.',
    });

    renderPage();

    expect(
      await screen.findByText('Could not load your schedule.')
    ).toBeInTheDocument();
  });
});
