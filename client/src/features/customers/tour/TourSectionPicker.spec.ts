import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TourSectionPicker } from './TourSectionPicker';
import { TOUR_SECTIONS } from './tourSections';

describe('TourSectionPicker', () => {
  it('lists Full tour and every section with its step count', () => {
    render(
      createElement(TourSectionPicker, {
        sections: TOUR_SECTIONS,
        onStart: vi.fn(),
        onClose: vi.fn(),
      })
    );

    expect(
      screen.getByRole('button', { name: 'Full tour' })
    ).toBeInTheDocument();
    for (const section of TOUR_SECTIONS) {
      expect(
        screen.getByRole('button', {
          name: new RegExp(`${section.title}.*${section.steps.length} step`),
        })
      ).toBeInTheDocument();
    }
  });

  it('starts the chosen section, or everything for Full tour', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      createElement(TourSectionPicker, {
        sections: TOUR_SECTIONS,
        onStart,
        onClose: vi.fn(),
      })
    );

    await user.click(screen.getByRole('button', { name: /^Booking/ }));
    expect(onStart).toHaveBeenLastCalledWith('booking');

    await user.click(screen.getByRole('button', { name: 'Full tour' }));
    expect(onStart).toHaveBeenLastCalledWith();
  });
});
