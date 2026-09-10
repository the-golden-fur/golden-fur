import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeContext } from '../../providers/ThemeProvider/themeContext';
import type { ThemeContextValue } from '../../providers/ThemeProvider/themeContext';
import { WeightUnitToggle } from './WeightUnitToggle';

function renderWithContext(overrides: Partial<ThemeContextValue>) {
  const value: ThemeContextValue = {
    theme: { role: 'staff', mode: 'system' },
    setMode: vi.fn(),
    fontSize: 'medium',
    setFontSize: vi.fn(),
    weightUnit: 'kg',
    setWeightUnit: vi.fn(),
    ...overrides,
  };

  render(
    createElement(
      ThemeContext.Provider,
      { value },
      createElement(WeightUnitToggle)
    )
  );

  return value;
}

describe('WeightUnitToggle', () => {
  it('marks the active unit and switches on click', async () => {
    const user = userEvent.setup();
    const value = renderWithContext({ weightUnit: 'kg' });

    expect(screen.getByRole('radio', { name: /Kilograms/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );

    await user.click(screen.getByRole('radio', { name: /Pounds/ }));

    expect(value.setWeightUnit).toHaveBeenCalledWith('lbs');
  });
});
