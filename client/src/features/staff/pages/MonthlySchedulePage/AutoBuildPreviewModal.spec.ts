import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BranchScheduleEntry, StaffProfile } from '../../staff.types';
import { AutoBuildPreviewModal } from './AutoBuildPreviewModal';

const ROSTER: StaffProfile[] = [
  {
    id: 'staff-1',
    branch_id: 'branch-a',
    role: 'Groomer',
    username: 'groomer1',
    registered_email: 'groomer1@example.com',
    display_name: 'Maria Groomer',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    archived_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

function buildEntry(
  overrides: Partial<BranchScheduleEntry> = {}
): BranchScheduleEntry {
  return {
    id: 'entry-1',
    staff_id: 'staff-1',
    start_time: '2026-07-13T01:00:00.000Z',
    end_time: '2026-07-13T10:00:00.000Z',
    reason: null,
    created_by: 'admin-1',
    created_by_name: 'Admin One',
    created_at: '2026-07-01T00:00:00.000Z',
    status: 'approved',
    is_quick_action: false,
    is_full_day: true,
    reviewed_by: null,
    reviewed_at: null,
    denial_reason: null,
    requested_reviewer_id: null,
    leave_type: 'Vacation Leave',
    created_by_auto_build: false,
    staff: { id: 'staff-1', display_name: 'Maria Groomer' },
    ...overrides,
  };
}

describe('AutoBuildPreviewModal', () => {
  it('pre-checks the proposed dates and shows the count against the target', () => {
    render(
      createElement(AutoBuildPreviewModal, {
        year: 2026,
        month: 7,
        roster: ROSTER,
        preview: {
          assignments: [{ staff_id: 'staff-1', dates: ['2026-07-06'] }],
          targetPerStaff: 4,
        },
        entriesByStaffAndDate: new Map(),
        isCommitting: false,
        onClose: vi.fn(),
        onConfirm: vi.fn().mockResolvedValue({ error: null }),
      })
    );

    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Maria Groomer rest day on 2026-07-06')
    ).toBeChecked();
  });

  it('renders a day with an existing entry as a locked badge instead of a checkbox', () => {
    const entriesByStaffAndDate = new Map([
      ['staff-1', new Map([['2026-07-13', [buildEntry()]]])],
    ]);

    render(
      createElement(AutoBuildPreviewModal, {
        year: 2026,
        month: 7,
        roster: ROSTER,
        preview: {
          assignments: [{ staff_id: 'staff-1', dates: [] }],
          targetPerStaff: 4,
        },
        entriesByStaffAndDate,
        isCommitting: false,
        onClose: vi.fn(),
        onConfirm: vi.fn().mockResolvedValue({ error: null }),
      })
    );

    expect(
      screen.queryByLabelText('Maria Groomer rest day on 2026-07-13')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTitle('Vacation Leave (already scheduled)')
    ).toHaveTextContent('VL');
  });

  it('toggling a checkbox and confirming sends the updated assignment', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue({ error: null });

    render(
      createElement(AutoBuildPreviewModal, {
        year: 2026,
        month: 7,
        roster: ROSTER,
        preview: {
          assignments: [{ staff_id: 'staff-1', dates: [] }],
          targetPerStaff: 4,
        },
        entriesByStaffAndDate: new Map(),
        isCommitting: false,
        onClose: vi.fn(),
        onConfirm,
      })
    );

    await user.click(
      screen.getByLabelText('Maria Groomer rest day on 2026-07-06')
    );
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledWith([
      { staff_id: 'staff-1', dates: ['2026-07-06'] },
    ]);
  });

  it('closing the modal calls onClose without ever calling onConfirm', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      createElement(AutoBuildPreviewModal, {
        year: 2026,
        month: 7,
        roster: ROSTER,
        preview: {
          assignments: [{ staff_id: 'staff-1', dates: ['2026-07-06'] }],
          targetPerStaff: 4,
        },
        entriesByStaffAndDate: new Map(),
        isCommitting: false,
        onClose,
        onConfirm,
      })
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
