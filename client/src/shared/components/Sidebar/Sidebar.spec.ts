import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar, type SidebarSection } from './Sidebar';

function renderSidebar(
  sections: SidebarSection[],
  collapsed = false,
  onToggleCollapse = vi.fn(),
  initialPath = '/staff/dashboard/admin'
) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialPath] },
      createElement(Sidebar, { sections, collapsed, onToggleCollapse })
    )
  );
}

describe('Sidebar', () => {
  it('renders a heading per labeled section and none for a null label', () => {
    renderSidebar([
      {
        label: null,
        items: [{ title: 'Dashboard', to: '/staff/dashboard/admin' }],
      },
      {
        label: 'Management',
        items: [{ title: 'Staff Management', to: '/staff/admin/staff' }],
      },
    ]);

    expect(
      screen.getByRole('heading', { name: 'Management' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/staff/dashboard/admin'
    );
  });

  it('marks the link matching the current route as active', () => {
    renderSidebar([
      {
        label: null,
        items: [
          { title: 'Dashboard', to: '/staff/dashboard/admin' },
          { title: 'Staff Management', to: '/staff/admin/staff' },
        ],
      },
    ]);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(
      screen.getByRole('link', { name: 'Staff Management' })
    ).not.toHaveAttribute('aria-current');
  });

  it('calls onToggleCollapse when the collapse button is clicked', async () => {
    const onToggleCollapse = vi.fn();
    renderSidebar(
      [
        {
          label: null,
          items: [{ title: 'Dashboard', to: '/staff/dashboard/admin' }],
        },
      ],
      false,
      onToggleCollapse
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    );

    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('hides section headings and exposes an expand label when collapsed', () => {
    renderSidebar(
      [
        {
          label: 'Management',
          items: [{ title: 'Staff Management', to: '/staff/admin/staff' }],
        },
      ],
      true
    );

    expect(
      screen.queryByRole('heading', { name: 'Management' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' })
    ).toBeInTheDocument();
  });
});
