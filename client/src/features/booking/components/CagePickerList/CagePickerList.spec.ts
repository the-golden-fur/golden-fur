import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CagePickerList } from './CagePickerList';
import * as bookingApi from '../../api/booking.api';

vi.mock('../../api/booking.api', () => ({
  getCagePickerOptions: vi.fn(),
}));

const OPTIONS = [
  { type: 'no_preference' as const },
  {
    type: 'specific' as const,
    cage_id: 'cage-s',
    cage_label: 'Makati-S-01',
    size: 'S',
  },
  {
    type: 'specific' as const,
    cage_id: 'cage-m',
    cage_label: 'Makati-M-01',
    size: 'M',
  },
];

function mockOptions() {
  vi.mocked(bookingApi.getCagePickerOptions).mockResolvedValue({
    data: { cage_picker_enabled: true, options: OPTIONS },
    error: null,
  });
}

describe('CagePickerList', () => {
  it('every cage is selectable when restrictToPetSize is off (receptionist mode)', async () => {
    mockOptions();
    const onSelect = vi.fn();

    render(
      createElement(CagePickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        selected: null,
        onSelect,
        recommendedSize: 'S',
        restrictToPetSize: false,
      })
    );

    await waitFor(() =>
      expect(screen.getAllByRole('button')).toHaveLength(3)
    );

    const mCage = screen.getByRole('button', { name: /Makati-M-01/ });
    expect(mCage).not.toBeDisabled();

    fireEvent.click(mCage);
    expect(onSelect).toHaveBeenCalledWith({
      type: 'specific',
      cage_id: 'cage-m',
    });
  });

  it('Custom change (cage size booking restriction): a mismatched-size cage is disabled, not clickable, when restrictToPetSize is on', async () => {
    mockOptions();
    const onSelect = vi.fn();

    render(
      createElement(CagePickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        selected: null,
        onSelect,
        recommendedSize: 'S',
        restrictToPetSize: true,
      })
    );

    await waitFor(() =>
      expect(screen.getAllByRole('button')).toHaveLength(3)
    );

    const sCage = screen.getByRole('button', { name: /Makati-S-01/ });
    const mCage = screen.getByRole('button', { name: /Makati-M-01/ });

    expect(sCage).not.toBeDisabled();
    expect(mCage).toBeDisabled();
    expect(screen.getByText('Staff only')).toBeInTheDocument();

    // onSelect fires once already for the auto-selected "No preference"
    // default - clicking the disabled cage must not add a second call.
    onSelect.mockClear();
    fireEvent.click(mCage);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('"No preference" stays selectable even when restrictToPetSize is on', async () => {
    mockOptions();
    const onSelect = vi.fn();

    render(
      createElement(CagePickerList, {
        accessToken: 'token',
        branchId: 'branch-1',
        selected: { type: 'specific', cage_id: 'cage-m' },
        onSelect,
        recommendedSize: 'S',
        restrictToPetSize: true,
      })
    );

    const noPreference = await screen.findByRole('button', {
      name: /No preference/,
    });
    expect(noPreference).not.toBeDisabled();

    fireEvent.click(noPreference);
    expect(onSelect).toHaveBeenCalledWith({ type: 'no_preference' });
  });
});
