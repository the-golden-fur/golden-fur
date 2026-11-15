import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAttendanceDay,
  getStaffProfile,
  setAttendance,
} from '../../api/staff.api';
import type { AttendanceDay, AttendanceRow } from '../../staff.types';
import { AttendancePage } from './AttendancePage';

vi.mock('../../../../shared/auth/providers/AuthProvider/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me' }, accessToken: 'token' }),
}));
vi.mock('../../api/staff.api', () => ({
  getAttendanceDay: vi.fn(),
  getStaffProfile: vi.fn(),
  setAttendance: vi.fn(),
}));
vi.mock('../../../maintenance/api/maintenance.api', () => ({
  listBranches: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

function row(overrides: Partial<AttendanceRow>): AttendanceRow {
  return {
    staff_id: 's-1',
    display_name: 'Ana',
    role: 'Groomer',
    status: 'Present',
    leave_type: null,
    locked: false,
    booking_count: 0,
    ...overrides,
  };
}

function mockDay(rows: AttendanceRow[], date = '2026-11-01') {
  vi.mocked(getAttendanceDay).mockResolvedValue({
    data: { date, today: '2026-11-01', rows } as AttendanceDay,
    error: null,
  });
}

function renderPage() {
  render(
    <MemoryRouter>
      <AttendancePage />
    </MemoryRouter>
  );
}

describe('AttendancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getStaffProfile).mockResolvedValue({
      data: { role: 'Supervisor', branch_id: 'b-1' },
      error: null,
    } as never);
    vi.mocked(setAttendance).mockResolvedValue({
      data: { reassigned: [], needs_rescheduling: [] },
      error: null,
    });
  });

  it('never loads for a role outside the gate', async () => {
    vi.mocked(getStaffProfile).mockResolvedValue({
      data: { role: 'Groomer', branch_id: 'b-1' },
      error: null,
    } as never);
    renderPage();

    await waitFor(() => expect(getStaffProfile).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText('Attendance')).not.toBeInTheDocument()
    );
    expect(getAttendanceDay).not.toHaveBeenCalled();
  });

  it('shows staff as Present by default', async () => {
    mockDay([row({})]);
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Present' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects nothing on a rest day, so Present stays deliberate', async () => {
    mockDay([row({ status: null, leave_type: 'Rest Day' })]);
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Present' })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('gives sick leave no controls', async () => {
    mockDay([
      row({
        status: null,
        leave_type: 'Sick Leave',
        locked: true,
      }),
    ]);
    renderPage();

    await screen.findByText('Ana');
    expect(screen.getAllByText(/Sick Leave/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Present' })).toBeNull();
  });

  it('makes past days read-only', async () => {
    mockDay([row({})], '2026-10-01');
    renderPage();

    expect(
      await screen.findByText("Past attendance can't be changed.")
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Absent' })).toBeNull();
  });

  it("doesn't let a Supervisor mark themselves", async () => {
    mockDay([row({ staff_id: 'me' })]);
    renderPage();

    await screen.findByText('Ana');
    expect(screen.queryByRole('button', { name: 'Absent' })).toBeNull();
  });

  it('confirms before an Absent that moves bookings, then reports the rest', async () => {
    const user = userEvent.setup();
    mockDay([row({ booking_count: 2 })]);
    vi.mocked(setAttendance).mockResolvedValue({
      data: {
        reassigned: [
          {
            booking_id: 'b-1',
            pet_name: 'Mochi',
            service_category: 'Grooming',
            scheduled_start: '2026-11-01T02:00:00Z',
            assigned_to: 'Ben',
          },
        ],
        needs_rescheduling: [
          {
            booking_id: 'b-2',
            pet_name: 'Rex',
            service_category: 'Grooming',
            scheduled_start: '2026-11-01T03:00:00Z',
            assigned_to: null,
          },
        ],
      },
      error: null,
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Absent' }));
    expect(setAttendance).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Mark absent' }));

    expect(await screen.findByText(/1 booking moved/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Rex/ })).toHaveAttribute(
      'href',
      '/staff/bookings/b-2'
    );
  });

  it('saves an Absent with no bookings straight away', async () => {
    const user = userEvent.setup();
    mockDay([row({})]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Absent' }));

    await waitFor(() =>
      expect(setAttendance).toHaveBeenCalledWith(
        'b-1',
        's-1',
        { date: '2026-11-01', status: 'Absent' },
        'token'
      )
    );
  });
});
