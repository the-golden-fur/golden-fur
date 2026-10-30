import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TimeInput } from './TimeInput';
import { formatTimeValue } from './formatTimeValue';

describe('formatTimeValue', () => {
  it('formats a 24h HH:MM value to 12h with AM/PM', () => {
    expect(formatTimeValue('07:00')).toBe('7:00 AM');
    expect(formatTimeValue('00:00')).toBe('12:00 AM');
    expect(formatTimeValue('12:00')).toBe('12:00 PM');
    expect(formatTimeValue('18:30')).toBe('6:30 PM');
  });

  it('returns an empty string for an empty value', () => {
    expect(formatTimeValue('')).toBe('');
  });
});

describe('TimeInput', () => {
  it.each([
    ['05:00', true],
    ['13:00', true],
    ['09:00', false],
    ['12:59', false],
    ['', false],
  ])('range message for %s: %s', (value, shown) => {
    render(
      createElement(TimeInput, {
        value,
        onChange: vi.fn(),
        min: '09:00',
        max: '12:59',
      })
    );

    expect(screen.queryAllByRole('alert')).toHaveLength(shown ? 1 : 0);
  });

  it('shows no range message without bounds', () => {
    render(createElement(TimeInput, { value: '05:00', onChange: vi.fn() }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('typing in the native time input calls onChange with the raw HH:MM value', () => {
    const onChange = vi.fn();
    render(
      createElement(TimeInput, {
        value: '07:00',
        onChange,
        'aria-label': 'Start time',
      })
    );

    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '09:15' },
    });

    expect(onChange).toHaveBeenCalledWith('09:15');
  });

  it('picking a quick-pick preset calls onChange with that preset value', () => {
    const onChange = vi.fn();
    render(
      createElement(TimeInput, {
        value: '07:00',
        onChange,
        'aria-label': 'Start time',
        presets: ['12:00', '18:00'],
      })
    );

    fireEvent.change(screen.getByLabelText('Start time quick-pick'), {
      target: { value: '18:00' },
    });

    expect(onChange).toHaveBeenCalledWith('18:00');
  });
});
