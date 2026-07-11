import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as staffApi from '../../../api/staff.api';
import { UnavailabilityBlockForm } from './UnavailabilityBlockForm';

vi.mock('../../../api/staff.api', () => ({
  createUnavailabilityBlock: vi.fn(),
}));

function renderForm(onCreated = vi.fn()) {
  return render(
    createElement(UnavailabilityBlockForm, {
      staffId: 'staff-1',
      accessToken: 'token',
      onCreated,
    })
  );
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
      screen.getByRole('button', { name: /unavailable until end of shift/i })
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
      target: { value: '2026-07-11T09:00' },
    });
    fireEvent.change(screen.getByLabelText(/^end$/i), {
      target: { value: '2026-07-11T17:00' },
    });
    await userEvent.type(screen.getByLabelText(/reason/i), 'Vet appointment');

    await userEvent.click(
      screen.getByRole('button', { name: /create custom block/i })
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
      screen.getByRole('button', { name: /create custom block/i })
    );

    expect(
      await screen.findByText(/end time must be after start time/i)
    ).toBeInTheDocument();
    expect(staffApi.createUnavailabilityBlock).not.toHaveBeenCalled();
  });
});
