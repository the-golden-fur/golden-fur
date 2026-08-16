import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput } from './OtpInput';

function Controlled({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return createElement(OtpInput, {
    value,
    onChange: (next: string) => {
      setValue(next);
      onChange?.(next);
    },
    label: '6-digit code',
  });
}

describe('OtpInput', () => {
  it('renders one box per digit, each with its own accessible label', () => {
    render(
      createElement(OtpInput, {
        value: '',
        onChange: vi.fn(),
        label: '6-digit code',
      })
    );

    expect(
      screen.getByRole('group', { name: '6-digit code' })
    ).toBeInTheDocument();
    for (let index = 1; index <= 6; index += 1) {
      expect(screen.getByLabelText(`Digit ${index} of 6`)).toBeInTheDocument();
    }
  });

  it('auto-advances focus box-to-box while typing and reports the full code', async () => {
    const onChange = vi.fn();
    render(createElement(Controlled, { onChange }));

    await userEvent.type(screen.getByLabelText('Digit 1 of 6'), '123456');

    expect(onChange).toHaveBeenLastCalledWith('123456');
    for (let index = 1; index <= 6; index += 1) {
      expect(screen.getByLabelText(`Digit ${index} of 6`)).toHaveValue(
        String(index)
      );
    }
    expect(screen.getByLabelText('Digit 6 of 6')).toHaveFocus();
  });

  it('Backspace on an empty box clears and moves focus to the previous box', async () => {
    render(createElement(Controlled));

    await userEvent.type(screen.getByLabelText('Digit 1 of 6'), '12');
    expect(screen.getByLabelText('Digit 3 of 6')).toHaveFocus();

    await userEvent.keyboard('{Backspace}');
    expect(screen.getByLabelText('Digit 2 of 6')).toHaveValue('');
    expect(screen.getByLabelText('Digit 2 of 6')).toHaveFocus();
  });

  it('splits a pasted code across boxes', async () => {
    const onChange = vi.fn();
    render(createElement(Controlled, { onChange }));

    const firstBox = screen.getByLabelText('Digit 1 of 6');
    firstBox.focus();
    await userEvent.paste('654321');

    expect(onChange).toHaveBeenLastCalledWith('654321');
  });
});
