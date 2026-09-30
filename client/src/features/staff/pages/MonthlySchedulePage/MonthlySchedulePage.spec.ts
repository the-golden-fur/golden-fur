import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as maintenanceApi from '../../../maintenance/api/maintenance.api';
import * as policyApi from '../../../booking/api/policy.api';
import * as staffApi from '../../api/staff.api';
import type { BranchScheduleEntry, StaffProfile } from '../../staff.types';
import { MonthlySchedulePage } from './MonthlySchedulePage';

vi.mock('../../api/staff.api', () => ({
  getStaffProfile: vi.fn(),
  listBranchSchedule: vi.fn(),
  listStaff: vi.fn(),
  createUnavailabilityBlock: vi.fn(),
  cancelUnavailabilityBlock: vi.fn(),
  previewAutoBuildSchedule: vi.fn(),
  commitAutoBuildSchedule: vi.fn(),
  clearAutoBuildSchedule: vi.fn(),
}));

vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn(),
}));

vi.mock('../../../booking/api/policy.api', async () => {
  const actual = await vi.importActual<typeof policyApi>(
    '../../../booking/api/policy.api'
  );
  return {
    ...actual,
    listPolicyConfigurations: vi.fn(),
  };
});

const VIEWER: StaffProfile = {
  id: 'admin-1',
  branch_id: 'branch-makati',
  role: 'Admin',
  username: 'admin1',
  registered_email: 'admin1@example.com',
  display_name: 'Admin One',
  profile_photo_url: null,
  phone_number: null,
  emergency_contact_name: null,
  emergency_contact_number: null,
  preferred_communication_channel: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const GROOMER: StaffProfile = {
  ...VIEWER,
  id: 'staff-1',
  role: 'Groomer',
  display_name: 'Maria Groomer',
};

// Dated relative to the real current month (rather than mocking the system
// clock, which hangs @testing-library's findBy*/waitFor polling under
// vitest's fake timers) - the 15th is always valid in every month, so the
// page's "defaults to the current month" view always includes it.
const now = new Date();
const MID_MONTH_START = new Date(
  now.getFullYear(),
  now.getMonth(),
  15
).toISOString();

function buildEntry(
  overrides: Partial<BranchScheduleEntry> = {}
): BranchScheduleEntry {
  return {
    id: 'entry-1',
    staff_id: 'staff-1',
    start_time: MID_MONTH_START,
    end_time: MID_MONTH_START,
    reason: null,
    created_by: 'admin-1',
    created_by_name: 'Admin One',
    created_at: MID_MONTH_START,
    status: 'approved',
    is_quick_action: false,
    is_full_day: true,
    reviewed_by: null,
    reviewed_at: null,
    denial_reason: null,
    requested_reviewer_id: null,
    leave_type: 'Rest Day',
    created_by_auto_build: false,
    staff: { id: 'staff-1', display_name: 'Maria Groomer' },
    ...overrides,
  };
}

const NEXT_MONTH_DAY_SIX = `${now.getFullYear()}-${String(
  now.getMonth() + 1
).padStart(2, '0')}-06`;

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'admin-1', email: 'admin1@example.com' },
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
        createElement(MonthlySchedulePage)
      )
    )
  );
}

function mockCommon(entries: BranchScheduleEntry[]) {
  vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
    data: VIEWER,
    error: null,
  });
  vi.mocked(maintenanceApi.listBranches).mockResolvedValue({
    data: [],
    error: null,
  });
  vi.mocked(staffApi.listStaff).mockResolvedValue({
    data: [GROOMER],
    error: null,
  });
  vi.mocked(policyApi.listPolicyConfigurations).mockResolvedValue({
    data: [],
    error: null,
  });
  vi.mocked(staffApi.listBranchSchedule).mockResolvedValue({
    data: entries,
    error: null,
  });
}

describe('MonthlySchedulePage', () => {
  it('Notion-style remaster (session 110): renders schedule entries as calendar chips via the shared DataCalendar', async () => {
    mockCommon([buildEntry()]);

    renderPage();

    expect(
      await screen.findByText('Maria Groomer - Rest Day')
    ).toBeInTheDocument();
  });

  it('clicking a chip opens the entry detail panel', async () => {
    mockCommon([buildEntry({ leave_type: 'Sick Leave', status: 'pending' })]);
    const user = userEvent.setup();

    renderPage();

    await user.click(
      await screen.findByText('Maria Groomer - Sick Leave (pending)')
    );

    expect(await screen.findByText('Status: pending')).toBeInTheDocument();
  });

  it("clicking a day's add button opens the add-entry panel for that date", async () => {
    mockCommon([]);
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => expect(staffApi.listBranchSchedule).toHaveBeenCalled());

    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
    await user.click(
      screen.getByRole('button', { name: `Add schedule entry on ${dateKey}` })
    );

    expect(
      await screen.findByText(`Add schedule entry - ${dateKey}`)
    ).toBeInTheDocument();
  });

  it('switching to Grid view shows the roster as a staff x date table instead', async () => {
    mockCommon([buildEntry()]);
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Maria Groomer - Rest Day');

    await user.click(screen.getByRole('button', { name: 'Grid' }));

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Maria Groomer')).toBeInTheDocument();
  });

  it('the page-level month nav (shared by Calendar and Grid) re-fetches with a new date range', async () => {
    mockCommon([]);
    const user = userEvent.setup();

    renderPage();

    await waitFor(() =>
      expect(staffApi.listBranchSchedule).toHaveBeenCalledTimes(1)
    );

    await user.click(screen.getByLabelText('Next month'));

    await waitFor(() =>
      expect(staffApi.listBranchSchedule).toHaveBeenCalledTimes(2)
    );
  });

  it('redirects away when the viewer role is not Admin/Supervisor/Superadmin', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: { ...VIEWER, role: 'Groomer' },
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.queryByText('Monthly Schedule')).not.toBeInTheDocument()
    );
  });

  it('Auto Build: confirm-with-input -> preview -> adjust -> commit reloads the schedule', async () => {
    mockCommon([]);
    const user = userEvent.setup();

    vi.mocked(staffApi.previewAutoBuildSchedule).mockResolvedValue({
      data: {
        assignments: [{ staff_id: 'staff-1', dates: [NEXT_MONTH_DAY_SIX] }],
        targetPerStaff: 1,
      },
      error: null,
    });
    vi.mocked(staffApi.commitAutoBuildSchedule).mockResolvedValue({
      data: { inserted: 1 },
      error: null,
    });

    renderPage();
    await waitFor(() =>
      expect(staffApi.listBranchSchedule).toHaveBeenCalledTimes(1)
    );

    await user.click(screen.getByRole('button', { name: 'Auto Build' }));
    expect(
      await screen.findByText('Auto Build Monthly Schedule')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Build' }));

    expect(
      await screen.findByText('Review Auto Build proposal')
    ).toBeInTheDocument();
    expect(staffApi.previewAutoBuildSchedule).toHaveBeenCalledWith(
      'branch-makati',
      {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        restDaysPerWeek: 1,
      },
      'token'
    );
    // Pre-checked from the proposal.
    expect(
      screen.getByLabelText(`Maria Groomer rest day on ${NEXT_MONTH_DAY_SIX}`)
    ).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(staffApi.commitAutoBuildSchedule).toHaveBeenCalledWith(
        'branch-makati',
        {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          assignments: [{ staff_id: 'staff-1', dates: [NEXT_MONTH_DAY_SIX] }],
        },
        'token'
      )
    );

    expect(
      screen.queryByText('Review Auto Build proposal')
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(staffApi.listBranchSchedule).toHaveBeenCalledTimes(2)
    );
  });

  it('Auto Build: unchecking a proposed day before confirming excludes it from the commit', async () => {
    mockCommon([]);
    const user = userEvent.setup();

    vi.mocked(staffApi.previewAutoBuildSchedule).mockResolvedValue({
      data: {
        assignments: [{ staff_id: 'staff-1', dates: [NEXT_MONTH_DAY_SIX] }],
        targetPerStaff: 1,
      },
      error: null,
    });
    vi.mocked(staffApi.commitAutoBuildSchedule).mockResolvedValue({
      data: { inserted: 0 },
      error: null,
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Auto Build' }));
    await user.click(screen.getByRole('button', { name: 'Build' }));
    await screen.findByText('Review Auto Build proposal');

    await user.click(
      screen.getByLabelText(`Maria Groomer rest day on ${NEXT_MONTH_DAY_SIX}`)
    );
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(staffApi.commitAutoBuildSchedule).toHaveBeenCalledWith(
        'branch-makati',
        {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          assignments: [{ staff_id: 'staff-1', dates: [] }],
        },
        'token'
      )
    );
  });

  it('Auto Build: canceling the preview discards the proposal without saving anything', async () => {
    mockCommon([]);
    const user = userEvent.setup();

    vi.mocked(staffApi.previewAutoBuildSchedule).mockResolvedValue({
      data: {
        assignments: [{ staff_id: 'staff-1', dates: [NEXT_MONTH_DAY_SIX] }],
        targetPerStaff: 1,
      },
      error: null,
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Auto Build' }));
    await user.click(screen.getByRole('button', { name: 'Build' }));
    await screen.findByText('Review Auto Build proposal');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByText('Review Auto Build proposal')
    ).not.toBeInTheDocument();
    expect(staffApi.commitAutoBuildSchedule).not.toHaveBeenCalled();
  });

  it('Clear Monthly Schedule: shows a danger warning and deletes only on confirm', async () => {
    mockCommon([buildEntry()]);
    const user = userEvent.setup();

    vi.mocked(staffApi.clearAutoBuildSchedule).mockResolvedValue({
      data: { deleted: 3 },
      error: null,
    });

    renderPage();
    await screen.findByText('Maria Groomer - Rest Day');

    await user.click(
      screen.getByRole('button', { name: 'Clear Monthly Schedule' })
    );
    expect(
      await screen.findByText('Clear Monthly Schedule?')
    ).toBeInTheDocument();
    expect(staffApi.clearAutoBuildSchedule).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() =>
      expect(staffApi.clearAutoBuildSchedule).toHaveBeenCalledWith(
        'branch-makati',
        { year: now.getFullYear(), month: now.getMonth() + 1 },
        'token'
      )
    );
    await waitFor(() =>
      expect(staffApi.listBranchSchedule).toHaveBeenCalledTimes(2)
    );
  });
});
