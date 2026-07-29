import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeContext } from '../../providers/ThemeProvider/themeContext';
import { FontSizeSlider } from './FontSizeSlider';

function renderSlider(
  fontSize: 'small' | 'medium' | 'large' | 'x-large',
  setFontSize = vi.fn()
) {
  return render(
    createElement(
      ThemeContext.Provider,
      {
        value: {
          theme: { role: 'staff' as const, mode: 'system' as const },
          setMode: vi.fn(),
          fontSize,
          setFontSize,
        },
      },
      createElement(FontSizeSlider)
    )
  );
}

describe('FontSizeSlider', () => {
  it('reflects the current preference as the slider value and label', () => {
    renderSlider('large');

    const slider = screen.getByRole('slider', { name: 'Font size' });
    expect(slider).toHaveValue('2');
    expect(slider).toHaveAttribute('aria-valuetext', 'Large');
  });

  it('renders sample text below the slider', () => {
    renderSlider('medium');

    expect(screen.getByText(/sample text/i)).toBeInTheDocument();
  });

  it('calls setFontSize with the step matching the new slider position', () => {
    const setFontSize = vi.fn();
    renderSlider('medium', setFontSize);

    const slider = screen.getByRole('slider', { name: 'Font size' });
    fireEvent.change(slider, { target: { value: '2' } });

    expect(setFontSize).toHaveBeenCalledWith('large');
  });
});
