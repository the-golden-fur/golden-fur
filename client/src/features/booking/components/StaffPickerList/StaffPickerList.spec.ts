import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StaffPickerList } from './StaffPickerList';
import * as bookingApi from '../../api/booking.api';

vi.mock('../../api/booking.api', () => ({
  getStaffPickerOptions: vi.fn(),
}));

const OPTIONS = [
  { type: 'no_preference' as const },
  {
    type: 'specific' as const,
    staff_id: 'staff-1',
    display_name: 'Ana Cruz',
    profile_photo_url: null,
  },
];

const THREE_OPTIONS = [
  ...OPTIONS,
  {
    type: 'specific' as const,
    staff_id: 'staff-2',
    display_name: 'Ben Reyes',
    profile_photo_url: null,
  },
];

/** getStaffPickerOptions success body - max_concurrent_per_staff defaults to
 * 1 unless a test overrides it. */
function pickerOk(
  body: Partial<{
    staff_picker_enabled: boolean;
    options: typeof OPTIONS;
    max_concurrent_per_staff: number;
  }>
) {
  return {
    data: {
      staff_picker_enabled: true,
      options: OPTIONS,
      max_concurrent_per_staff: 1,
      ...body,
    },
    error: null,
  };
}

describe('StaffPickerList', () => {
  it('AC-2: "No preference" appears first', async () => {
    vi.mocked(bookingApi.getStaffPickerOptions).mockResolvedValue({
      data: { staff_picker_enabled: true, options: OPTIONS },
      error: null,
    });

    render(
      createElement(StaffPickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        scheduledStart: '2026-08-03T01:00:00Z',
        scheduledEnd: '2026-08-03T02:00:00Z',
        selected: null,
        onSelect: vi.fn(),
      })
    );

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(2));
    expect(screen.getAllByRole('button')[0]).toHaveTextContent('No preference');
  });

  it('auto-selects "No preference" once options load, if nothing is selected yet', async () => {
    vi.mocked(bookingApi.getStaffPickerOptions).mockResolvedValue({
      data: { staff_picker_enabled: true, options: OPTIONS },
      error: null,
    });
    const onSelect = vi.fn();

    render(
      createElement(StaffPickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        scheduledStart: '2026-08-03T01:00:00Z',
        scheduledEnd: '2026-08-03T02:00:00Z',
        selected: null,
        onSelect,
      })
    );

    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith({ type: 'no_preference' })
    );
  });

  it('does not override an already-selected preference on load', async () => {
    vi.mocked(bookingApi.getStaffPickerOptions).mockResolvedValue({
      data: { staff_picker_enabled: true, options: OPTIONS },
      error: null,
    });
    const onSelect = vi.fn();

    render(
      createElement(StaffPickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        scheduledStart: '2026-08-03T01:00:00Z',
        scheduledEnd: '2026-08-03T02:00:00Z',
        selected: { type: 'specific', staff_id: 'staff-1' },
        onSelect,
      })
    );

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(2));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('AC-3: selecting a specific staff member calls onSelect with their staff_id', async () => {
    vi.mocked(bookingApi.getStaffPickerOptions).mockResolvedValue({
      data: { staff_picker_enabled: true, options: OPTIONS },
      error: null,
    });
    const onSelect = vi.fn();

    render(
      createElement(StaffPickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        scheduledStart: '2026-08-03T01:00:00Z',
        scheduledEnd: '2026-08-03T02:00:00Z',
        selected: null,
        onSelect,
      })
    );

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(2));
    fireEvent.click(screen.getByText('Ana Cruz'));

    expect(onSelect).toHaveBeenCalledWith({
      type: 'specific',
      staff_id: 'staff-1',
    });
  });

  it('selecting "No preference" calls onSelect without a staff_id', async () => {
    vi.mocked(bookingApi.getStaffPickerOptions).mockResolvedValue({
      data: { staff_picker_enabled: true, options: OPTIONS },
      error: null,
    });
    const onSelect = vi.fn();

    render(
      createElement(StaffPickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        scheduledStart: '2026-08-03T01:00:00Z',
        scheduledEnd: '2026-08-03T02:00:00Z',
        selected: null,
        onSelect,
      })
    );

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(2));
    fireEvent.click(screen.getByText('No preference'));

    expect(onSelect).toHaveBeenCalledWith({ type: 'no_preference' });
  });

  it('search filters specific staff by name but always keeps "No preference" pinned first', async () => {
    vi.mocked(bookingApi.getStaffPickerOptions).mockResolvedValue({
      data: { staff_picker_enabled: true, options: THREE_OPTIONS },
      error: null,
    });

    render(
      createElement(StaffPickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        scheduledStart: '2026-08-03T01:00:00Z',
        scheduledEnd: '2026-08-03T02:00:00Z',
        selected: null,
        onSelect: vi.fn(),
      })
    );

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(3));

    await userEvent.type(
      screen.getByPlaceholderText('Search staff by name...'),
      'ben'
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent('No preference');
    expect(buttons[1]).toHaveTextContent('Ben Reyes');
  });

  it('sort dropdown reorders specific staff by name, still keeping "No preference" first', async () => {
    vi.mocked(bookingApi.getStaffPickerOptions).mockResolvedValue({
      data: { staff_picker_enabled: true, options: THREE_OPTIONS },
      error: null,
    });

    render(
      createElement(StaffPickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        scheduledStart: '2026-08-03T01:00:00Z',
        scheduledEnd: '2026-08-03T02:00:00Z',
        selected: null,
        onSelect: vi.fn(),
      })
    );

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(3));

    await userEvent.selectOptions(
      screen.getByDisplayValue('Sort: Default'),
      'name-desc'
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('No preference');
    expect(buttons[1]).toHaveTextContent('Ben Reyes');
    expect(buttons[2]).toHaveTextContent('Ana Cruz');
  });

  it('disables a staff member already at capacity for an overlapping cart booking, and drops them if selected', async () => {
    vi.mocked(bookingApi.getStaffPickerOptions).mockResolvedValue(
      pickerOk({ options: THREE_OPTIONS, max_concurrent_per_staff: 1 })
    );
    const onSelect = vi.fn();

    render(
      createElement(StaffPickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        scheduledStart: '2026-08-03T01:00:00Z',
        scheduledEnd: '2026-08-03T02:00:00Z',
        selected: { type: 'specific', staff_id: 'staff-1' },
        onSelect,
        // staff-1 already picked once elsewhere in the cart; capacity is 1.
        cartStaffOverlapCounts: { 'staff-1': 1 },
      })
    );

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(3));

    const anaButton = screen.getByText('Ana Cruz').closest('button');
    expect(anaButton).toBeDisabled();
    // staff-2 is untouched.
    expect(screen.getByText('Ben Reyes').closest('button')).not.toBeDisabled();
    // the now-invalid selection is cleared back to "No preference".
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith({ type: 'no_preference' })
    );
  });

  it('does not disable a staff member still below capacity', async () => {
    vi.mocked(bookingApi.getStaffPickerOptions).mockResolvedValue(
      pickerOk({ options: THREE_OPTIONS, max_concurrent_per_staff: 2 })
    );

    render(
      createElement(StaffPickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        scheduledStart: '2026-08-03T01:00:00Z',
        scheduledEnd: '2026-08-03T02:00:00Z',
        selected: null,
        onSelect: vi.fn(),
        cartStaffOverlapCounts: { 'staff-1': 1 },
      })
    );

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(3));
    expect(screen.getByText('Ana Cruz').closest('button')).not.toBeDisabled();
  });

  it('renders nothing and calls onUnavailable when the picker is disabled for this branch+service type', async () => {
    vi.mocked(bookingApi.getStaffPickerOptions).mockResolvedValue({
      data: { staff_picker_enabled: false, options: [] },
      error: null,
    });
    const onUnavailable = vi.fn();

    render(
      createElement(StaffPickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        serviceCategory: 'Grooming',
        scheduledStart: '2026-08-03T01:00:00Z',
        scheduledEnd: '2026-08-03T02:00:00Z',
        selected: null,
        onSelect: vi.fn(),
        onUnavailable,
      })
    );

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
