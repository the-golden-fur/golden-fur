import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BookingStepper } from './BookingStepper';

describe('BookingStepper', () => {
  it('renders the given step count and labels dynamically (AC-1)', () => {
    render(
      createElement(BookingStepper, {
        steps: ['Pet', 'Branch', 'Service'],
        currentStepIndex: 1,
        furthestCompletedIndex: 1,
        onStepSelect: vi.fn(),
      })
    );

    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('Service')).toBeInTheDocument();
  });

  it('allows navigating back to a completed step (AC-2)', () => {
    const onStepSelect = vi.fn();
    render(
      createElement(BookingStepper, {
        steps: ['Pet', 'Branch', 'Service'],
        currentStepIndex: 2,
        furthestCompletedIndex: 2,
        onStepSelect,
      })
    );

    fireEvent.click(screen.getByText('Pet'));
    expect(onStepSelect).toHaveBeenCalledWith(0);
  });

  it('disables steps beyond the furthest completed one', () => {
    render(
      createElement(BookingStepper, {
        steps: ['Pet', 'Branch', 'Service'],
        currentStepIndex: 0,
        furthestCompletedIndex: 0,
        onStepSelect: vi.fn(),
      })
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toBeDisabled();
    expect(buttons[2]).toBeDisabled();
  });
});
