import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as staffApi from '../../../api/staff.api';
import type { StaffProfile } from '../../../staff.types';
import { UnavailabilityBlockForm } from './UnavailabilityBlockForm';

vi.mock('../../../api/staff.api', () => ({
  createUnavailabilityBlock: vi.fn(),
  listStaff: vi.fn(),
}));

// Computed relative to "now" (not a hardcoded date) - the form now rejects
// past start times/dates, so fixture inputs simulating valid user entry must
// stay in the future as real time passes.
function tomorrowDatetimeLocal(hour: string): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${tomorrow.toISOString().slice(0, 10)}T${hour}`;
}

function tomorrowDate(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function renderForm(onCreated = vi.fn(), showReviewerPicker = false) {
  return render(
    createElement(UnavailabilityBlockForm, {
      staffId: 'staff-1',
      accessToken: 'token',
      onCreated,
      showReviewerPicker,
    })
  );
}

function buildReviewer(overrides: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: 'reviewer-1',
    branch_id: 'branch-1',
    role: 'Admin',
    username: 'admin1',
    registered_email: 'admin1@example.com',
    display_name: 'Ada Min',
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

describe('UnavailabilityBlockForm', () => {
  it('creates a quick-action block and reports it back to the caller', async () => {
    const block = {
      id: 'block-1',
      staff_id: 'staff-1',
      start_time: '2026-07-11T09:00:00.000Z',
      end_time: '2026-07-11T17:00:00.000Z',
      reason: null,
      created_by: 'staff-1',
      created_at: '2026-07-11T09:00:00.000Z',
    };
    vi.mocked(staffApi.createUnavailabilityBlock).mockResolvedValue({
      data: block,
      error: null,
    });
    const onCreated = vi.fn();
    renderForm(onCreated);

    await userEvent.click(
      screen.getByRole('button', { name: /take the rest of today off/i })
    );

    expect(staffApi.createUnavailabilityBlock).toHaveBeenCalledWith(
      'staff-1',
      'token',
      { quick_action: true }
    );
    expect(onCreated).toHaveBeenCalledWith(block);
  });

  it('submits a valid custom range', async () => {
    const block = {
      id: 'block-2',
      staff_id: 'staff-1',
      start_time: '2026-07-11T09:00:00.000Z',
      end_time: '2026-07-11T17:00:00.000Z',
      reason: 'Vet appointment',
      created_by: 'staff-1',
      created_at: '2026-07-11T09:00:00.000Z',
    };
    vi.mocked(staffApi.createUnavailabilityBlock).mockResolvedValue({
      data: block,
      error: null,
    });
    const onCreated = vi.fn();
    renderForm(onCreated);

    fireEvent.change(screen.getByLabelText(/^start$/i), {
      target: { value: tomorrowDatetimeLocal('09:00') },
    });
    fireEvent.change(screen.getByLabelText(/^end$/i), {
      target: { value: tomorrowDatetimeLocal('17:00') },
    });
    await userEvent.type(screen.getByLabelText(/reason/i), 'Vet appointment');

    await userEvent.click(
      screen.getByRole('button', { name: /request day\(s\) off/i })
    );

    expect(staffApi.createUnavailabilityBlock).toHaveBeenCalledWith(
      'staff-1',
      'token',
      expect.objectContaining({ reason: 'Vet appointment' })
    );
    expect(onCreated).toHaveBeenCalledWith(block);
  });

  it('shows a validation error and never calls the API when end is before start', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/^start$/i), {
      target: { value: '2026-07-11T17:00' },
    });
    fireEvent.change(screen.getByLabelText(/^end$/i), {
      target: { value: '2026-07-11T09:00' },
    });

    await userEvent.click(
      screen.getByRole('button', { name: /request day\(s\) off/i })
    );

    expect(
      await screen.findByText(/end time must be after start time/i)
    ).toBeInTheDocument();
    expect(staffApi.createUnavailabilityBlock).not.toHaveBeenCalled();
  });

  it('Entire day option submits is_full_day + date instead of a time range', async () => {
    const block = {
      id: 'block-3',
      staff_id: 'staff-1',
      start_time: '2026-07-13T01:00:00.000Z',
      end_time: '2026-07-13T10:00:00.000Z',
      reason: null,
      created_by: 'staff-1',
      created_at: '2026-07-13T00:00:00.000Z',
      is_full_day: true,
    };
    vi.mocked(staffApi.createUnavailabilityBlock).mockResolvedValue({
      data: block,
      error: null,
    });
    const onCreated = vi.fn();
    renderForm(onCreated);

    await userEvent.click(
      screen.getByRole('checkbox', { name: /entire day/i })
    );

    expect(screen.queryByLabelText(/^start$/i)).not.toBeInTheDocument();

    const futureDate = tomorrowDate();
    fireEvent.change(screen.getByLabelText(/^date$/i), {
      target: { value: futureDate },
    });

    await userEvent.click(
      screen.getByRole('button', { name: /request day\(s\) off/i })
    );

    expect(staffApi.createUnavailabilityBlock).toHaveBeenCalledWith(
      'staff-1',
      'token',
      expect.objectContaining({ is_full_day: true, date: futureDate })
    );
    expect(onCreated).toHaveBeenCalledWith(block);
  });

  it('rejects a start time in the past with a client-side error', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/^start$/i), {
      target: { value: '2020-01-01T09:00' },
    });
    fireEvent.change(screen.getByLabelText(/^end$/i), {
      target: { value: '2020-01-01T17:00' },
    });

    await userEvent.click(
      screen.getByRole('button', { name: /request day\(s\) off/i })
    );

    expect(
      await screen.findByText(/start time cannot be in the past/i)
    ).toBeInTheDocument();
    expect(staffApi.createUnavailabilityBlock).not.toHaveBeenCalled();
  });

  it('a quick-time button fills in that field for the currently selected date', async () => {
    renderForm();

    const startInput = screen.getByLabelText(/^start$/i);
    fireEvent.change(startInput, {
      target: { value: tomorrowDatetimeLocal('06:00') },
    });

    const startField = startInput.closest('label');
    if (!startField) throw new Error('Start field wrapper not found');
    await userEvent.click(
      within(startField).getByRole('button', { name: '9:00 AM' })
    );

    const expectedDate = tomorrowDatetimeLocal('09:00').slice(0, 10);
    expect(startInput).toHaveValue(`${expectedDate}T09:00`);
  });

  describe('reviewer picker (showReviewerPicker)', () => {
    it('is not shown by default (on-behalf-of usage, e.g. StaffManagementPage)', () => {
      renderForm();

      expect(screen.queryByLabelText('Send to')).not.toBeInTheDocument();
    });

    it('lists only Admin/Supervisor/Superadmin, excluding the requester themselves', async () => {
      vi.mocked(staffApi.listStaff).mockResolvedValue({
        data: [
          buildReviewer({
            id: 'reviewer-1',
            display_name: 'Ada Min',
            role: 'Admin',
          }),
          buildReviewer({ id: 'staff-1', display_name: 'Self', role: 'Admin' }),
          buildReviewer({
            id: 'reviewer-2',
            display_name: 'Gary Groomer',
            role: 'Groomer',
          }),
        ],
        error: null,
      });

      renderForm(vi.fn(), true);

      const select = await screen.findByLabelText('Send to');
      expect(
        screen.getByRole('option', { name: /ada min/i })
      ).toBeInTheDocument();
      expect(select).toContainHTML('Any manager');
      expect(
        screen.queryByRole('option', { name: /self/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('option', { name: /gary groomer/i })
      ).not.toBeInTheDocument();
    });

    it('sends the selected reviewer id along with the request', async () => {
      vi.mocked(staffApi.listStaff).mockResolvedValue({
        data: [buildReviewer({ id: 'reviewer-1', display_name: 'Ada Min' })],
        error: null,
      });
      vi.mocked(staffApi.createUnavailabilityBlock).mockResolvedValue({
        data: {
          id: 'block-4',
          staff_id: 'staff-1',
          start_time: '2026-07-11T09:00:00.000Z',
          end_time: '2026-07-11T17:00:00.000Z',
          reason: null,
          created_by: 'staff-1',
          created_at: '2026-07-11T09:00:00.000Z',
        },
        error: null,
      });

      renderForm(vi.fn(), true);

      const select = await screen.findByLabelText('Send to');
      await userEvent.selectOptions(select, 'reviewer-1');
      await userEvent.click(
        screen.getByRole('button', { name: /take the rest of today off/i })
      );

      await waitFor(() =>
        expect(staffApi.createUnavailabilityBlock).toHaveBeenCalledWith(
          'staff-1',
          'token',
          expect.objectContaining({ requested_reviewer_id: 'reviewer-1' })
        )
      );
    });
  });
});
