import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToggleSwitch } from './ToggleSwitch';

describe('ToggleSwitch', () => {
  it('exposes its state via role=switch and aria-checked', () => {
    render(
      createElement(ToggleSwitch, {
        checked: true,
        onChange: vi.fn(),
        label: 'Makati',
      })
    );

    expect(screen.getByRole('switch', { name: 'Makati' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('emits the opposite state on click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(ToggleSwitch, {
        checked: false,
        onChange,
        label: 'Southwoods',
      })
    );

    await user.click(screen.getByRole('switch', { name: 'Southwoods' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not emit when disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(ToggleSwitch, {
        checked: false,
        onChange,
        label: 'Makati',
        disabled: true,
      })
    );

    await user.click(screen.getByRole('switch', { name: 'Makati' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
