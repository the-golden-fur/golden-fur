import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar, type SidebarSection } from './Sidebar';

/** jsdom has no real DataTransfer implementation - a minimal stand-in is
 * enough for the component's own setData/getData calls during a simulated
 * HTML5 drag. */
function createDataTransfer() {
  const store = new Map<string, string>();
  return {
    effectAllowed: '',
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
  };
}

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

  it('keeps section headings in the DOM (CSS-collapsed, not unmounted) and exposes an expand label when collapsed', () => {
    // Headings used to be removed from the DOM entirely on collapse, which
    // meant they could only pop in/out instantly on expand/collapse - kept
    // in the DOM now (hidden via opacity/max-height in Sidebar.module.css)
    // so the collapse can animate smoothly, and they stay in the
    // accessibility tree either way.
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
      screen.getByRole('heading', { name: 'Management' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' })
    ).toBeInTheDocument();
  });

  it('collapses and expands a labeled category independently of the whole sidebar', async () => {
    renderSidebar([
      {
        label: 'Management',
        items: [
          { title: 'Staff Management', to: '/staff/admin/staff' },
          { title: 'Archive', to: '/staff/admin/archive' },
        ],
      },
    ]);

    const categoryToggle = screen.getByRole('button', {
      name: 'Management',
    });
    expect(categoryToggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('link', { name: 'Staff Management' })
    ).toBeInTheDocument();

    await userEvent.click(categoryToggle);

    expect(categoryToggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('gives an unlabeled (flat-list) section a sort menu but no collapse toggle/heading', () => {
    renderSidebar([
      {
        label: null,
        items: [{ title: 'Dashboard', to: '/staff/dashboard/admin' }],
      },
    ]);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort' })).toBeInTheDocument();
  });

  it('sorts a category alphabetically via the "..." menu, persists it, and marks the active choice', async () => {
    window.localStorage.clear();

    renderSidebar([
      {
        label: 'Management',
        items: [
          { title: 'Staff Management', to: '/staff/admin/staff' },
          { title: 'Archive', to: '/staff/admin/archive' },
        ],
      },
    ]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Sort Management' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Sort: Alphabetical' })
    );

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('Archive');
    expect(links[1]).toHaveAccessibleName('Staff Management');
    expect(
      window.localStorage.getItem('sidebar-section-sort-staff-Management')
    ).toBe('alphabetical');

    await userEvent.click(
      screen.getByRole('button', { name: 'Sort Management' })
    );
    const activeItem = screen.getByRole('menuitem', {
      name: 'Sort: Alphabetical',
    });
    expect(activeItem.querySelector('.lucide-check')).toBeInTheDocument();
    const inactiveItem = screen.getByRole('menuitem', {
      name: 'Sort: Custom order',
    });
    expect(inactiveItem.querySelector('.lucide-check')).not.toBeInTheDocument();
  });

  it('is draggable under the default Custom order mode, not under Alphabetical', async () => {
    window.localStorage.clear();

    renderSidebar([
      {
        label: 'Management',
        items: [
          { title: 'Staff Management', to: '/staff/admin/staff' },
          { title: 'Archive', to: '/staff/admin/archive' },
        ],
      },
    ]);

    const item = screen
      .getByRole('link', { name: 'Staff Management' })
      .closest('li') as HTMLLIElement;
    expect(item).toHaveAttribute('draggable', 'true');

    await userEvent.click(
      screen.getByRole('button', { name: 'Sort Management' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Sort: Alphabetical' })
    );

    expect(item).toHaveAttribute('draggable', 'false');
  });

  it('reorders items via drag-and-drop under Custom order and persists the new order', () => {
    window.localStorage.clear();

    renderSidebar([
      {
        label: 'Management',
        items: [
          { title: 'Staff Management', to: '/staff/admin/staff' },
          { title: 'Archive', to: '/staff/admin/archive' },
        ],
      },
    ]);

    const firstItem = screen
      .getByRole('link', { name: 'Staff Management' })
      .closest('li') as HTMLLIElement;
    const secondItem = screen
      .getByRole('link', { name: 'Archive' })
      .closest('li') as HTMLLIElement;
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(firstItem, { dataTransfer });
    fireEvent.dragEnter(secondItem, { dataTransfer });
    fireEvent.dragEnd(firstItem, { dataTransfer });

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('Archive');
    expect(links[1]).toHaveAccessibleName('Staff Management');
    expect(
      window.localStorage.getItem('sidebar-section-order-staff-Management')
    ).toBe(JSON.stringify(['/staff/admin/archive', '/staff/admin/staff']));
  });
});
