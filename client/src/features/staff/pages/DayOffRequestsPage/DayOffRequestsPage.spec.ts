import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import { getSupabaseClient } from '../../../../shared/auth/api/auth.api';
import * as staffApi from '../../api/staff.api';
import type {
  StaffProfile,
  UnavailabilityHistoryEntry,
} from '../../staff.types';
import { DayOffRequestsPage } from './DayOffRequestsPage';

vi.mock('../../api/staff.api', () => ({
  getStaffProfile: vi.fn(),
  listUnavailabilityHistory: vi.fn(),
  createUnavailabilityBlock: vi.fn(),
  cancelUnavailabilityBlock: vi.fn(),
  updateUnavailabilityBlock: vi.fn(),
  listStaff: vi.fn(),
}));

vi.mock('../../../../shared/auth/api/auth.api', () => ({
  getSupabaseClient: vi.fn(),
}));

const PROFILE: StaffProfile = {
  id: 'staff-1',
  branch_id: 'branch-makati',
  role: 'Receptionist',
  username: 'receptionist',
  registered_email: 'staff@example.com',
  display_name: 'Front Desk',
  profile_photo_url: null,
  phone_number: null,
  emergency_contact_name: null,
  emergency_contact_number: null,
  preferred_communication_channel: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function entry(
  overrides: Partial<UnavailabilityHistoryEntry>
): UnavailabilityHistoryEntry {
  return {
    id: 'block',
    staff_id: 'staff-1',
    start_time: '2030-01-10T00:00:00.000Z',
    end_time: '2030-01-10T10:00:00.000Z',
    reason: null,
    created_by: 'staff-1',
    created_at: '2026-10-01T00:00:00.000Z',
    status: 'pending',
    is_quick_action: false,
    is_full_day: true,
    reviewed_by: null,
    reviewed_at: null,
    denial_reason: null,
    requested_reviewer_id: null,
    leave_type: 'Vacation Leave',
    created_by_auto_build: false,
    reviewer_name: null,
    requested_reviewer_name: null,
    created_by_name: 'Front Desk',
    ...overrides,
  };
}

const PENDING = entry({
  id: 'block-pending',
  reason: 'Family trip',
  requested_reviewer_id: 'sup-1',
  requested_reviewer_name: 'Sam Supervisor',
  created_at: '2026-10-20T00:00:00.000Z',
});

const DENIED = entry({
  id: 'block-denied',
  start_time: '2020-03-02T00:00:00.000Z',
  end_time: '2020-03-02T10:00:00.000Z',
  status: 'denied',
  leave_type: 'Sick Leave',
  reviewed_by: 'sup-1',
  reviewed_at: '2020-03-01T00:00:00.000Z',
  reviewer_name: 'Sam Supervisor',
  denial_reason: 'Short-staffed',
  created_at: '2020-02-20T00:00:00.000Z',
});

const REST_DAY = entry({
  id: 'block-rest',
  start_time: '2026-09-07T00:00:00.000Z',
  end_time: '2026-09-07T10:00:00.000Z',
  status: 'approved',
  leave_type: 'Rest Day',
  created_by: 'admin-1',
  created_by_name: 'Ada Admin',
  created_at: '2026-09-01T00:00:00.000Z',
});

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
      AuthContext.Provider,
      { value: authValue },
      createElement(DayOffRequestsPage)
    )
  );
}

function tableRows() {
  // First row is the header.
  return screen.getAllByRole('row').slice(1);
}

describe('DayOffRequestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({ data: [], error: null });
    vi.mocked(getSupabaseClient).mockReturnValue(null);
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: PROFILE,
      error: null,
    });
    vi.mocked(staffApi.listUnavailabilityHistory).mockResolvedValue({
      data: [PENDING, DENIED, REST_DAY],
      error: null,
    });
  });

  it('is titled Day Off Requests and loads the history for the signed-in staff member', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Day Off Requests' })
    ).toBeInTheDocument();
    expect(staffApi.listUnavailabilityHistory).toHaveBeenCalledWith(
      'staff-1',
      'token'
    );
  });

  it('shows the history as a table with status, dates, reviewer and the other request columns', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Day Off Requests' });

    for (const header of [
      'Dates',
      'Type',
      'Status',
      'Reason',
      'Sent to',
      'Reviewer',
      'Reviewed',
      'Requested',
      'Denial reason',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: header })
      ).toBeInTheDocument();
    }

    // Newest request first by default.
    const rows = tableRows();
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Family trip')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Pending')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Sam Supervisor')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Short-staffed')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Denied')).toBeInTheDocument();
  });

  it('includes manager-set Rest Days in the history', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Day Off Requests' });
    expect(screen.getByText('Rest Day')).toBeInTheDocument();
  });

  it('New Request opens the day off form in a modal', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'New Request' })
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).queryByRole('button', {
        name: /take the rest of today off/i,
      })
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /request day\(s\) off/i })
    ).toBeInTheDocument();
  });

  it('creating a request closes the modal, confirms it, and reloads the history', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.createUnavailabilityBlock).mockResolvedValue({
      data: entry({ id: 'block-new' }),
      error: null,
    });

    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'New Request' })
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Entire day'));
    await user.click(
      within(dialog).getByRole('button', { name: /request day\(s\) off/i })
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Day off request sent.'
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    await waitFor(() =>
      expect(staffApi.listUnavailabilityHistory).toHaveBeenCalledTimes(2)
    );
  });

  it('shows an empty state with no history yet, but keeps New Request', async () => {
    vi.mocked(staffApi.listUnavailabilityHistory).mockResolvedValue({
      data: [],
      error: null,
    });

    renderPage();

    expect(
      await screen.findByText(/no day off requests yet/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'New Request' })
    ).toBeInTheDocument();
  });

  it('search narrows the history', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Day Off Requests' });
    await user.type(
      screen.getByPlaceholderText('Search your requests...'),
      'short-staffed'
    );

    const rows = tableRows();
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Denied')).toBeInTheDocument();
  });

  it('offers the search box, Filter, Sort and the five views', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Day Off Requests' });
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort' })).toBeInTheDocument();
    for (const view of ['Table', 'List', 'Gallery', 'Board', 'Calendar']) {
      expect(screen.getByRole('button', { name: view })).toBeInTheDocument();
    }
  });

  it('board view groups by status with every status column', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Board' }));

    expect(screen.getByRole('combobox', { name: 'Group by' })).toHaveValue(
      'status'
    );
    const board = screen.getByRole('region', {
      name: 'Day off requests board',
    });
    for (const column of ['Pending', 'Approved', 'Denied']) {
      expect(within(board).getAllByText(column).length).toBeGreaterThan(0);
    }
  });

  it('only a pending, not-yet-started request can be cancelled, behind a confirm step', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.cancelUnavailabilityBlock).mockResolvedValue({
      data: null,
      error: null,
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Day Off Requests' });

    // Only the pending row carries a "..." menu.
    const menus = screen.getAllByRole('button', { name: /^Actions for/ });
    expect(menus).toHaveLength(1);

    await user.click(menus[0]);
    await user.click(screen.getByText('Cancel request'));

    expect(staffApi.cancelUnavailabilityBlock).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Yes, cancel it' })
    );

    await waitFor(() =>
      expect(staffApi.cancelUnavailabilityBlock).toHaveBeenCalledWith(
        'staff-1',
        'token',
        'block-pending'
      )
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Day off request cancelled.'
    );
    // Still in the history, now marked Cancelled - and no longer actionable.
    const row = screen.getByText('Family trip').closest('tr') as HTMLElement;
    expect(within(row).getByText('Cancelled')).toBeInTheDocument();
    expect(
      screen.queryAllByRole('button', { name: /^Actions for/ })
    ).toHaveLength(0);
  });

  it('has no "Off until" availability badge next to the title', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Day Off Requests' });
    expect(
      screen.queryByText(/checking availability/i)
    ).not.toBeInTheDocument();
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });

  it('right-clicking a pending request row offers Edit and Cancel; finished rows offer nothing', async () => {
    renderPage();

    fireEvent.contextMenu(await screen.findByText('Family trip'));
    const menu = screen.getByRole('menu');
    expect(
      within(menu).getByRole('menuitem', { name: 'Edit request' })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Cancel request' })
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.contextMenu(screen.getByText('Short-staffed'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('a manager-set entry can be cancelled but not edited', async () => {
    vi.mocked(staffApi.listUnavailabilityHistory).mockResolvedValue({
      data: [
        entry({
          id: 'block-onbehalf',
          reason: 'Set by admin',
          created_by: 'admin-1',
        }),
      ],
      error: null,
    });

    renderPage();

    fireEvent.contextMenu(await screen.findByText('Set by admin'));
    const menu = screen.getByRole('menu');
    expect(
      within(menu).queryByRole('menuitem', { name: 'Edit request' })
    ).not.toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Cancel request' })
    ).toBeInTheDocument();
  });

  it('Edit request opens the form prefilled and saves over the same request', async () => {
    const user = userEvent.setup();
    vi.mocked(staffApi.updateUnavailabilityBlock).mockResolvedValue({
      data: PENDING,
      error: null,
    });

    renderPage();

    fireEvent.contextMenu(await screen.findByText('Family trip'));
    await user.click(screen.getByRole('menuitem', { name: 'Edit request' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Edit day off request',
    });
    expect(within(dialog).getByLabelText('Entire day')).toBeChecked();
    const reasonInput = within(dialog).getByDisplayValue('Family trip');
    await user.clear(reasonInput);
    await user.type(reasonInput, 'Wedding');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );

    await waitFor(() =>
      expect(staffApi.updateUnavailabilityBlock).toHaveBeenCalledWith(
        'staff-1',
        'token',
        'block-pending',
        expect.objectContaining({ is_full_day: true, reason: 'Wedding' })
      )
    );
    expect(staffApi.createUnavailabilityBlock).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Day off request updated.'
    );
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

  it('shows an error state when the history fails to load', async () => {
    vi.mocked(staffApi.listUnavailabilityHistory).mockResolvedValue({
      data: null,
      error: 'Could not load your day off requests.',
    });

    renderPage();

    expect(
      await screen.findByText('Could not load your day off requests.')
    ).toBeInTheDocument();
  });
});
