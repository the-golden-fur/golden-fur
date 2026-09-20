import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardContextMenu } from './CardContextMenu';
import type { MoreOptionsMenuItem } from './MoreOptionsMenu';

function buildItems(onSelect: () => void): MoreOptionsMenuItem[] {
  return [
    { label: 'Edit', onSelect },
    { label: 'Delete', onSelect: vi.fn() },
  ];
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CardContextMenu', () => {
  it('renders no visible trigger button - only the child content', () => {
    render(
      <CardContextMenu items={buildItems(vi.fn())} label="Card actions">
        <div>Card content</div>
      </CardContextMenu>
    );

    expect(screen.getByText('Card content')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('right-click opens the menu, and the native context menu is suppressed', () => {
    render(
      <CardContextMenu items={buildItems(vi.fn())} label="Card actions">
        <div>Card content</div>
      </CardContextMenu>
    );

    const event = fireEvent.contextMenu(screen.getByText('Card content'));

    expect(event).toBe(false); // false means preventDefault() was called.
    expect(screen.getByRole('menu', { name: 'Card actions' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
  });

  it('clicking a menu item calls onSelect and closes the menu', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <CardContextMenu items={buildItems(onSelect)} label="Card actions">
        <div>Card content</div>
      </CardContextMenu>
    );

    fireEvent.contextMenu(screen.getByText('Card content'));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('clicking outside closes the menu', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <CardContextMenu items={buildItems(vi.fn())} label="Card actions">
          <div>Card content</div>
        </CardContextMenu>
        <button type="button">Outside</button>
      </div>
    );

    fireEvent.contextMenu(screen.getByText('Card content'));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('a held touch (long-press) without dragging opens the menu', () => {
    vi.useFakeTimers();

    render(
      <CardContextMenu items={buildItems(vi.fn())} label="Card actions">
        <div>Card content</div>
      </CardContextMenu>
    );

    const card = screen.getByText('Card content');
    fireEvent.touchStart(card, { touches: [{ clientX: 10, clientY: 10 }] });
    vi.advanceTimersByTime(600);
    fireEvent.touchEnd(card, {
      changedTouches: [{ clientX: 10, clientY: 10 }],
    });

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('a quick tap does not open the menu, so it still reaches content inside the card', () => {
    vi.useFakeTimers();

    render(
      <CardContextMenu items={buildItems(vi.fn())} label="Card actions">
        <div>Card content</div>
      </CardContextMenu>
    );

    const card = screen.getByText('Card content');
    fireEvent.touchStart(card, { touches: [{ clientX: 10, clientY: 10 }] });
    // No time advance - a quick tap.
    fireEvent.touchEnd(card, {
      changedTouches: [{ clientX: 10, clientY: 10 }],
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('a long hold that drags (a scroll gesture) does not open the menu', () => {
    vi.useFakeTimers();

    render(
      <CardContextMenu items={buildItems(vi.fn())} label="Card actions">
        <div>Card content</div>
      </CardContextMenu>
    );

    const card = screen.getByText('Card content');
    fireEvent.touchStart(card, { touches: [{ clientX: 10, clientY: 10 }] });
    vi.advanceTimersByTime(600);
    fireEvent.touchEnd(card, {
      changedTouches: [{ clientX: 80, clientY: 80 }],
    });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
