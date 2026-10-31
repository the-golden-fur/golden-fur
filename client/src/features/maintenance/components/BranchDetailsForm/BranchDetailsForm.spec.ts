import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Branch } from '../../maintenance.types';
import { BranchDetailsForm } from './BranchDetailsForm';

const BRANCH: Branch = {
  id: 'branch-1',
  name: 'Makati',
  address: 'Makati City, Philippines',
  contact_number: null,
  is_vet_branch: true,
  operating_hours: { monday: { open: '09:00', close: '18:00' } },
  grooming_hours: {},
  timezone: 'Asia/Manila',
  max_advance_booking_days: 365,
  is_active: true,
  archived_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

function renderForm(onSubmit = vi.fn().mockResolvedValue(null)) {
  render(
    createElement(BranchDetailsForm, {
      branch: BRANCH,
      submitLabel: 'Save branch',
      onSubmit,
    })
  );
  return onSubmit;
}

describe('BranchDetailsForm - booking date limit', () => {
  it("shows the branch's booking window and sends a changed value", async () => {
    const onSubmit = renderForm();

    const input = screen.getByLabelText(/Furthest a booking can be made/);
    expect(input).toHaveValue(365);
    expect(input).toHaveAttribute('max', '365');

    fireEvent.change(input, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save branch' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ max_advance_booking_days: 30 })
      )
    );
  });

  it('refuses more than 1 year', async () => {
    const onSubmit = renderForm();

    const input = screen.getByLabelText(/Furthest a booking can be made/);
    fireEvent.change(input, { target: { value: '400' } });
    // Bypass the browser's own `max` check to reach the form's.
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(
      await screen.findByText(
        'Booking window must be a whole number of days from 1 to 365.'
      )
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
