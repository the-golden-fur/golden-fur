import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => {
    window.localStorage.clear();
  });

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

  it('the icon rail shows only the expand toggle - no per-category or per-tile icons at all', () => {
    // Two things were tried and reverted here: every tile as its own icon
    // (piled into an undifferentiated wall for a multi-category sidebar),
    // then one icon per category (still made you guess which page you
    // wanted). The rail now shows nothing but the toggle - content stays
    // in the DOM (CSS-hidden via Sidebar.module.css's `.sidebarCollapsed
    // .itemList` rule) rather than being unmounted, so expanding back out
    // can still animate smoothly instead of popping in.
    renderSidebar(
      [
        {
          label: 'Management',
          items: [
            { title: 'Staff Management', to: '/staff/admin/staff' },
            { title: 'Archive', to: '/staff/admin/archive' },
          ],
        },
        {
          label: null,
          items: [{ title: 'Dashboard', to: '/staff/dashboard/admin' }],
        },
      ],
      true
    );

    expect(
      screen.getByRole('button', { name: 'Expand sidebar' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Expand sidebar to/ })
    ).not.toBeInTheDocument();
    // Kept in the DOM (not unmounted) for a smooth expand animation - see
    // the CSS-hidden precedent already established for collapse/expand.
    expect(
      screen.getByRole('heading', { name: 'Management' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Staff Management' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
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
    fireEvent.drop(secondItem, { dataTransfer });
    fireEvent.dragEnd(firstItem, { dataTransfer });

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('Archive');
    expect(links[1]).toHaveAccessibleName('Staff Management');
    expect(
      window.localStorage.getItem('sidebar-section-order-staff-Management')
    ).toBe(JSON.stringify(['/staff/admin/archive', '/staff/admin/staff']));
  });

  it('reflects the current page as "recently accessed" immediately on mount, not one navigation later', async () => {
    window.localStorage.clear();
    // Staff Management was visited a while ago; the page we're mounted on
    // right now (Archive) has no recorded visit yet - the fix under test
    // is that mounting *on* a page counts as visiting it immediately, not
    // only once you navigate elsewhere and the effect for the *next*
    // render catches up.
    window.localStorage.setItem(
      'sidebar-recent-staff',
      JSON.stringify({ '/staff/admin/staff': 1000 })
    );

    renderSidebar(
      [
        {
          label: 'Management',
          items: [
            { title: 'Staff Management', to: '/staff/admin/staff' },
            { title: 'Archive', to: '/staff/admin/archive' },
          ],
        },
      ],
      false,
      vi.fn(),
      '/staff/admin/archive'
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Sort Management' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Sort: Recently accessed' })
    );

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('Archive');
    expect(links[1]).toHaveAccessibleName('Staff Management');
  });

  it('does not reorder (or move the dragged node) on dragenter alone - only on drop', () => {
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

    // Reordering the DOM mid-gesture (on every dragenter) is what made
    // dragging "go crazy" - hovering over another item should only mark it
    // as the drop target, not actually move anything yet.
    fireEvent.dragStart(firstItem, { dataTransfer });
    fireEvent.dragEnter(secondItem, { dataTransfer });

    const linksMidDrag = screen.getAllByRole('link');
    expect(linksMidDrag[0]).toHaveAccessibleName('Staff Management');
    expect(linksMidDrag[1]).toHaveAccessibleName('Archive');
    expect(
      window.localStorage.getItem('sidebar-section-order-staff-Management')
    ).toBeNull();

    fireEvent.dragEnd(firstItem, { dataTransfer });
  });

  it('does not show a "Sort categories" control with only one labeled category', () => {
    renderSidebar([
      {
        label: 'Management',
        items: [{ title: 'Staff Management', to: '/staff/admin/staff' }],
      },
    ]);

    expect(
      screen.queryByRole('button', { name: 'Sort categories' })
    ).not.toBeInTheDocument();
  });

  it('sorts the categories themselves alphabetically via "Sort categories", and persists it', async () => {
    window.localStorage.clear();

    renderSidebar([
      {
        label: 'Veterinarian',
        items: [{ title: 'Consultation Queue', to: '/staff/veterinary' }],
      },
      {
        label: 'Management',
        items: [{ title: 'Staff Management', to: '/staff/admin/staff' }],
      },
    ]);

    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual([
      'Veterinarian',
      'Management',
    ]);

    await userEvent.click(
      screen.getByRole('button', { name: 'Sort categories' })
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Sort: Alphabetical' })
    );

    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual([
      'Management',
      'Veterinarian',
    ]);
    expect(window.localStorage.getItem('sidebar-category-sort-staff')).toBe(
      'alphabetical'
    );
  });

  it('reorders categories via drag-and-drop under Custom order and persists the new order', () => {
    window.localStorage.clear();

    renderSidebar([
      {
        label: 'Management',
        items: [{ title: 'Staff Management', to: '/staff/admin/staff' }],
      },
      {
        label: 'Veterinarian',
        items: [{ title: 'Consultation Queue', to: '/staff/veterinary' }],
      },
    ]);

    const firstCategory = screen
      .getByRole('heading', { name: 'Management' })
      .closest('div[draggable="true"]') as HTMLDivElement;
    const secondCategory = screen
      .getByRole('heading', { name: 'Veterinarian' })
      .closest('div[draggable="true"]') as HTMLDivElement;
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(firstCategory, { dataTransfer });
    fireEvent.dragEnter(secondCategory, { dataTransfer });
    fireEvent.drop(secondCategory, { dataTransfer });
    fireEvent.dragEnd(firstCategory, { dataTransfer });

    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual([
      'Veterinarian',
      'Management',
    ]);
    expect(window.localStorage.getItem('sidebar-category-order-staff')).toBe(
      JSON.stringify(['Veterinarian', 'Management'])
    );
  });
});
