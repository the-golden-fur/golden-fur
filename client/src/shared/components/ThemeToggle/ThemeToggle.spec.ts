import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeContext } from '../../providers/ThemeProvider/themeContext';
import { ThemeToggle } from './ThemeToggle';

function renderToggle(mode: 'light' | 'dark' | 'system', setMode = vi.fn()) {
  return render(
    createElement(
      ThemeContext.Provider,
      {
        value: {
          theme: { role: 'staff' as const, mode },
          setMode,
          fontSize: 'medium' as const,
          setFontSize: vi.fn(),
        },
      },
      createElement(ThemeToggle)
    )
  );
}

describe('ThemeToggle', () => {
  it('offers Device default, Light, and Dark, defaulting to Device default checked', () => {
    renderToggle('system');

    expect(
      screen.getByRole('radio', { name: 'Device default' })
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('calls setMode with the clicked option', async () => {
    const setMode = vi.fn();
    renderToggle('system', setMode);

    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(setMode).toHaveBeenCalledWith('dark');
  });
});
