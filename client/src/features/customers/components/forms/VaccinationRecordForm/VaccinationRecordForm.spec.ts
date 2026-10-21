import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createVaccinationRecord } from '../../../api/customer.api';
import { VaccinationRecordForm } from './VaccinationRecordForm';
import { todayDateKey } from '../../../../../shared/utils/isFutureDate';

vi.mock('../../../api/customer.api', () => ({
  createVaccinationRecord: vi.fn(),
  updateVaccinationRecord: vi.fn(),
}));

function renderForm(requireCard: boolean) {
  return render(
    createElement(VaccinationRecordForm, {
      petId: 'pet-1',
      accessToken: 'token',
      requireCard,
      onSaved: vi.fn(),
      onCancel: vi.fn(),
    })
  );
}

describe('VaccinationRecordForm', () => {
  it("stops the date picker at today, and won't send a future date", async () => {
    const user = userEvent.setup();
    renderForm(true);

    const dateGiven = screen.getByLabelText('Date given');
    expect(dateGiven).toHaveAttribute('max', todayDateKey());

    await user.type(screen.getByLabelText('Vaccine'), 'Rabies');
    await user.type(dateGiven, '2999-01-01');
    await user.click(screen.getByRole('button', { name: 'Add vaccination' }));

    // The browser's own max check, or the form's, stops it either way.
    expect(createVaccinationRecord).not.toHaveBeenCalled();
  });

  it("doesn't need a card from staff", async () => {
    const user = userEvent.setup();
    vi.mocked(createVaccinationRecord).mockResolvedValue({
      data: null,
      error: 'stop here',
    });
    renderForm(false);

    expect(
      screen.getByLabelText(/^Vaccination card photo \(optional\)/)
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Vaccine'), 'Rabies');
    await user.type(screen.getByLabelText('Date given'), '2026-07-01');
    await user.click(screen.getByRole('button', { name: 'Add vaccination' }));

    expect(createVaccinationRecord).toHaveBeenCalled();
  });
});
