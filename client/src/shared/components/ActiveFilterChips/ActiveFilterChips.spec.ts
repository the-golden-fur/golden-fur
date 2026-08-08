import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ActiveFilterChips } from './ActiveFilterChips';

describe('ActiveFilterChips', () => {
  it('renders nothing when there are no active chips', () => {
    const { container } = render(
      createElement(ActiveFilterChips, { chips: [] })
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders one chip per active filter', () => {
    render(
      createElement(ActiveFilterChips, {
        chips: [
          { id: 'date', label: 'Date: This week', onClear: vi.fn() },
          { id: 'status', label: 'Status: Pending', onClear: vi.fn() },
        ],
      })
    );

    expect(screen.getByText('Date: This week')).toBeInTheDocument();
    expect(screen.getByText('Status: Pending')).toBeInTheDocument();
  });

  it('calls onClear for the clicked chip only', async () => {
    const user = userEvent.setup();
    const clearDate = vi.fn();
    const clearStatus = vi.fn();

    render(
      createElement(ActiveFilterChips, {
        chips: [
          { id: 'date', label: 'Date: This week', onClear: clearDate },
          { id: 'status', label: 'Status: Pending', onClear: clearStatus },
        ],
      })
    );

    await user.click(screen.getByText('Date: This week'));

    expect(clearDate).toHaveBeenCalledTimes(1);
    expect(clearStatus).not.toHaveBeenCalled();
  });
});
