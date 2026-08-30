import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InfoPopover } from './InfoPopover';

function renderPopover() {
  return render(
    createElement(
      InfoPopover,
      { label: 'About walk-in bookings' },
      'The customer and pet are physically here right now.'
    )
  );
}

describe('InfoPopover', () => {
  it('hides the explanation until the trigger is clicked, and toggles it back off', async () => {
    const user = userEvent.setup();
    renderPopover();

    const trigger = screen.getByRole('button', {
      name: 'About walk-in bookings',
    });
    expect(
      screen.queryByText(/physically here right now/)
    ).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByText(/physically here right now/)).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(trigger);
    expect(
      screen.queryByText(/physically here right now/)
    ).not.toBeInTheDocument();
  });

  it('closes on Escape and on an outside click', async () => {
    const user = userEvent.setup();
    render(
      createElement(
        'div',
        null,
        createElement(
          InfoPopover,
          { label: 'About walk-in bookings' },
          'The customer and pet are physically here right now.'
        ),
        createElement('button', { type: 'button' }, 'outside')
      )
    );

    await user.click(
      screen.getByRole('button', { name: 'About walk-in bookings' })
    );
    expect(screen.getByText(/physically here right now/)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(
      screen.queryByText(/physically here right now/)
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'About walk-in bookings' })
    );
    await user.click(screen.getByText('outside'));
    expect(
      screen.queryByText(/physically here right now/)
    ).not.toBeInTheDocument();
  });

  it('stops the trigger click from bubbling to an enclosing clickable', async () => {
    const user = userEvent.setup();
    const onParentClick = vi.fn();

    render(
      createElement(
        'div',
        { onClick: onParentClick },
        createElement(
          InfoPopover,
          { label: 'About walk-in bookings' },
          'help text'
        )
      )
    );

    await user.click(
      screen.getByRole('button', { name: 'About walk-in bookings' })
    );
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
