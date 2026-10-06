import { fireEvent, render, screen } from '@testing-library/react';
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

    await user.click(
      screen.getByRole('menuitem', { name: 'View booking details' })
    );

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

  describe('placement near the bottom of the screen', () => {
    const ITEMS = [
      { label: 'Configure', onSelect: vi.fn() },
      { label: 'Rename', onSelect: vi.fn() },
      { label: 'Archive', onSelect: vi.fn() },
    ];

    function openMenuWithTriggerAt(top: number) {
      render(createElement(MoreOptionsMenu, { items: ITEMS }));
      const trigger = screen.getByRole('button', { name: 'More options' });
      vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
        top,
        bottom: top + 28,
        left: 500,
        right: 528,
        width: 28,
        height: 28,
        x: 500,
        y: top,
        toJSON: () => ({}),
      });
      fireEvent.click(trigger);
      return screen.getByRole('menu');
    }

    it('opens above the trigger when it would otherwise be cut off', () => {
      const menu = openMenuWithTriggerAt(window.innerHeight - 30);

      expect(menu.style.top).toBe('auto');
      expect(menu.style.bottom).toBe('34px');
    });

    it('opens below the trigger when there is room', () => {
      const menu = openMenuWithTriggerAt(100);

      expect(menu.style.top).toBe('132px');
      expect(menu.style.bottom).toBe('auto');
    });
  });
});
