import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ConfigTab } from './ConfigTab';

function renderTab(isSuperadmin: boolean, onSelectTile = vi.fn()) {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(ConfigTab, { isSuperadmin, onSelectTile })
    )
  );
}

describe('ConfigTab', () => {
  it('renders every admin-config page as a selectable tile for an Admin (no System Configuration)', () => {
    renderTab(false);

    expect(
      screen.getByRole('button', { name: /^services/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^discounts/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /system configuration/i })
    ).not.toBeInTheDocument();
  });

  it('adds the System Configuration tile for a Superadmin', () => {
    renderTab(true);

    expect(
      screen.getByRole('button', { name: /system configuration/i })
    ).toBeInTheDocument();
  });

  it('custom change: selecting a tile calls onSelectTile with that tile instead of navigating', async () => {
    const onSelectTile = vi.fn();
    renderTab(false, onSelectTile);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^discounts/i }));

    expect(onSelectTile).toHaveBeenCalledTimes(1);
    expect(onSelectTile.mock.calls[0][0]).toMatchObject({
      title: 'Discounts',
      to: '/staff/admin/discounts',
    });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
