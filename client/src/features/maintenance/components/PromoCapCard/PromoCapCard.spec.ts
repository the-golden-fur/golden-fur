import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PromoCapCard } from './PromoCapCard';
import type { PromoCapConfiguration } from '../../maintenance.types';

const CONFIG: PromoCapConfiguration = {
  id: 'cap-makati',
  branch_id: 'branch-makati',
  cap_type: 'flat',
  cap_value: 150,
  updated_by_staff_id: null,
  updated_at: '2026-07-26T00:00:00.000Z',
};

describe('PromoCapCard', () => {
  it('shows the existing saved cap for its scope', () => {
    render(
      createElement(PromoCapCard, {
        config: CONFIG,
        onSave: vi.fn(),
      })
    );

    expect(screen.getByLabelText('Cap value (PHP)')).toHaveValue(150);
    expect(screen.queryByText(/No cap saved yet/)).not.toBeInTheDocument();
  });

  it('shows the default values and an empty-state note when no cap is saved yet', () => {
    render(
      createElement(PromoCapCard, {
        config: undefined,
        onSave: vi.fn(),
      })
    );

    expect(screen.getByText(/No cap saved yet/)).toBeInTheDocument();
    expect(screen.getByLabelText('Cap value (%)')).toHaveValue(20);
  });

  it('saves the edited cap for its own scope independently', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(PromoCapCard, {
        config: CONFIG,
        onSave,
      })
    );

    const valueInput = screen.getByLabelText('Cap value (PHP)');
    await user.clear(valueInput);
    await user.type(valueInput, '200');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({ cap_type: 'flat', cap_value: 200 });
  });

  it('switching to the count cap type relabels the value field and rejects a fractional value', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(PromoCapCard, {
        config: CONFIG,
        onSave,
      })
    );

    await user.selectOptions(screen.getByLabelText('Cap type'), 'count');

    const valueInput = screen.getByLabelText('Cap value (promos)');
    await user.clear(valueInput);
    await user.type(valueInput, '1.5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();

    await user.clear(valueInput);
    await user.type(valueInput, '2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({ cap_type: 'count', cap_value: 2 });
  });

  it('shows a Saving state and disables the button', () => {
    render(
      createElement(PromoCapCard, {
        config: CONFIG,
        onSave: vi.fn(),
        isSaving: true,
      })
    );

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});
