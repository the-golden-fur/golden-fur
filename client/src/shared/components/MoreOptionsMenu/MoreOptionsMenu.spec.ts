import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MoreOptionsMenu } from './MoreOptionsMenu';

describe('MoreOptionsMenu', () => {
  it('is closed by default', () => {
    render(
      createElement(MoreOptionsMenu, {
        items: [{ label: 'View booking details', onSelect: vi.fn() }],
      })
    );

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens on trigger click and calls onSelect for the clicked item', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      createElement(MoreOptionsMenu, {
        items: [{ label: 'View booking details', onSelect }],
      })
    );

    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'View booking details' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes when clicking outside', async () => {
    const user = userEvent.setup();
    render(
      createElement('div', null, [
        createElement(MoreOptionsMenu, {
          key: 'menu',
          items: [{ label: 'View booking details', onSelect: vi.fn() }],
        }),
        createElement('button', { key: 'outside' }, 'Outside'),
      ])
    );

    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not bubble its trigger click to a surrounding clickable card', async () => {
    const user = userEvent.setup();
    const onCardClick = vi.fn();
    render(
      createElement(
        'div',
        { onClick: onCardClick, role: 'button', tabIndex: 0 },
        createElement(MoreOptionsMenu, {
          items: [{ label: 'View booking details', onSelect: vi.fn() }],
        })
      )
    );

    await user.click(screen.getByRole('button', { name: 'More options' }));

    expect(onCardClick).not.toHaveBeenCalled();
  });
});
