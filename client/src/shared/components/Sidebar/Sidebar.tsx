import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../MoreOptionsMenu/MoreOptionsMenu';
import type { ThemeRole } from '../../providers/ThemeProvider/themeContext';
import styles from './Sidebar.module.css';

export interface SidebarItem {
  title: string;
  to: string;
  icon?: LucideIcon;
}

export interface SidebarSection {
  /** null renders the section with no heading - used by every non-admin
   * staff role and the customer portal, so their nav looks like a single
   * flat list rather than an artificially-grouped one. */
  label: string | null;
  icon?: LucideIcon;
  items: SidebarItem[];
}

interface SidebarProps {
  sections: SidebarSection[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Scopes this sidebar's per-category collapse/sort/order/recently-
   * accessed preferences in localStorage - same 'staff'/'customer' scoping
   * AppShell already uses for the whole-sidebar collapsed flag. Defaults to
   * 'staff' so existing callers/tests that don't pass it keep working. */
  role?: ThemeRole;
}

type CategorySortKey = 'custom' | 'alphabetical' | 'recent';

const SORT_OPTIONS: Array<{ value: CategorySortKey; label: string }> = [
  { value: 'custom', label: 'Custom order' },
  { value: 'alphabetical', label: 'Alphabetical' },
  { value: 'recent', label: 'Recently accessed' },
];

function readStoredFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function readStoredSort(key: string): CategorySortKey {
  try {
    const value = window.localStorage.getItem(key);
    if (value === 'alphabetical' || value === 'recent' || value === 'custom') {
      return value;
    }
  } catch {
    // best-effort only
  }
  return 'custom';
}

function readStoredOrder(key: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')
      ? (parsed as string[])
      : null;
  } catch {
    return null;
  }
}

function readRecentMap(key: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function persistOrder(key: string, order: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(order));
  } catch {
    // best-effort only
  }
}

/** Applies a saved drag order (a list of `to` paths) on top of the config's
 * own item list - items not yet in the saved order (new tiles added after
 * the user last dragged) fall in at the end, in their original config
 * order; stale entries (a tile removed from config since) are dropped. */
function applyCustomOrder(
  items: SidebarItem[],
  order: string[] | null
): SidebarItem[] {
  if (!order) return items;

  const remaining = new Map(items.map((item) => [item.to, item]));
  const ordered: SidebarItem[] = [];
  for (const to of order) {
    const item = remaining.get(to);
    if (item) {
      ordered.push(item);
      remaining.delete(to);
    }
  }
  for (const item of items) {
    if (remaining.has(item.to)) ordered.push(item);
  }
  return ordered;
}

function sortItems(
  items: SidebarItem[],
  sortKey: CategorySortKey,
  recentMap: Record<string, number>
): SidebarItem[] {
  if (sortKey === 'alphabetical') {
    return [...items].sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sortKey === 'recent') {
    // Stable sort: items never visited (no recentMap entry) keep their
    // relative order, trailing behind anything that has been.
    return [...items].sort(
      (a, b) => (recentMap[b.to] ?? 0) - (recentMap[a.to] ?? 0)
    );
  }
  return items;
}

function isLabeledSection(
  section: SidebarSection
): section is SidebarSection & { label: string } {
  return section.label !== null;
}

/** Same shape as applyCustomOrder, keyed by a category's own label instead
 * of an item's route - reordering the categories themselves, not the items
 * inside one. */
function applyCategoryOrder<T extends { label: string }>(
  sections: T[],
  order: string[] | null
): T[] {
  if (!order) return sections;

  const remaining = new Map(sections.map((section) => [section.label, section]));
  const ordered: T[] = [];
  for (const label of order) {
    const section = remaining.get(label);
    if (section) {
      ordered.push(section);
      remaining.delete(label);
    }
  }
  for (const section of sections) {
    if (remaining.has(section.label)) ordered.push(section);
  }
  return ordered;
}

function categoryRecentScore(
  section: SidebarSection,
  recentMap: Record<string, number>
): number {
  return section.items.reduce(
    (max, item) => Math.max(max, recentMap[item.to] ?? 0),
    0
  );
}

function sortCategories<T extends SidebarSection & { label: string }>(
  sections: T[],
  sortKey: CategorySortKey,
  recentMap: Record<string, number>
): T[] {
  if (sortKey === 'alphabetical') {
    return [...sections].sort((a, b) => a.label.localeCompare(b.label));
  }
  if (sortKey === 'recent') {
    return [...sections].sort(
      (a, b) =>
        categoryRecentScore(b, recentMap) - categoryRecentScore(a, recentMap)
    );
  }
  return sections;
}

function findVisitedItem(
  pathname: string,
  allItems: SidebarItem[]
): SidebarItem | undefined {
  return allItems.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`)
  );
}

/** getBoundingClientRect().top is relative to the viewport, which makes it
 * contaminated by the sidebar's own scroll position: the <aside> itself
 * scrolls independently (overflow-y: auto), so if it scrolls between two
 * FLIP measurements, the delta would read as every item having "moved" by
 * the scroll distance even though nothing actually reordered - this was
 * the reported scroll-triggered twitching. Adding the scroll container's
 * current scrollTop cancels that out: scrolling down by N moves rect.top
 * up by N and scrollTop up by N, so their sum stays constant across a pure
 * scroll and only changes for a genuine layout change (reorder, collapse/
 * expand). */
function scrollInvariantTop(element: HTMLElement): number {
  const scrollTop = element.closest('aside')?.scrollTop ?? 0;
  return element.getBoundingClientRect().top + scrollTop;
}

/** Tracks the last-visited timestamp per sidebar route, so a category's
 * "Recently accessed" sort has something to sort by. Scoped to the whole
 * sidebar's item set rather than per-section - a given route only ever
 * lives in one category anyway.
 *
 * Custom change (fix): every visit is still recorded to localStorage as it
 * happens (the effect below), but the map actually returned for display is
 * now read exactly once, on mount, instead of reactively on every
 * navigation. Recomputing it live on each route change used to read
 * localStorage during render, one render before the effect for *that same*
 * navigation had actually written its timestamp - the sidebar's own
 * "Recently accessed" order was therefore always exactly one click stale
 * (it only caught up on the *next* navigation). Reporting live, correct
 * order is more state than it's worth for a sort mode that's inherently
 * about coarse recency - it now simply refreshes on the next full page
 * load (AppShell/Sidebar remount) instead of chasing every click. */
function useRecentlyAccessed(
  role: ThemeRole,
  allItems: SidebarItem[]
): Record<string, number> {
  const storageKey = `sidebar-recent-${role}`;
  const location = useLocation();

  const [recentMap] = useState<Record<string, number>>(() => {
    const current = readRecentMap(storageKey);
    const match = findVisitedItem(location.pathname, allItems);
    return match ? { ...current, [match.to]: Date.now() } : current;
  });

  useEffect(() => {
    const match = findVisitedItem(location.pathname, allItems);
    if (!match) return;

    const next = { ...readRecentMap(storageKey), [match.to]: Date.now() };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // best-effort only - a private-browsing quota error shouldn't block
      // navigation from working for the rest of the session.
    }
  }, [location.pathname, allItems, storageKey]);

  return recentMap;
}

/** Bundles the drag-and-drop wiring SidebarCategory needs to act as one
 * draggable "card" among its sibling categories - owned and computed by
 * Sidebar (which is the thing that actually knows about every category,
 * not just this one), passed down only for labeled categories once there's
 * more than one of them to reorder against. */
interface CategoryDragProps {
  draggable: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  sectionRef: (element: HTMLDivElement | null) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnter: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

interface SidebarCategoryProps {
  section: SidebarSection;
  sidebarCollapsed: boolean;
  role: ThemeRole;
  recentMap: Record<string, number>;
  categoryDrag?: CategoryDragProps;
}

/**
 * One nav category. Every category - labeled (the admin/superadmin grouped
 * view) or unlabeled (every other role's flat list) - gets a Notion-style
 * "..." menu offering three sort modes (Custom order/Alphabetical/Recently
 * accessed), persisted per role+label in localStorage. Labeled categories
 * additionally get their own collapse chevron. Under Custom order, items
 * become drag-and-drop reorderable (native HTML5 drag, no library) with a
 * FLIP-animated reflow, and the resulting order is persisted the same way.
 *
 * In the icon-rail (whole-sidebar-collapsed) state, every category's own
 * content (header and items alike) is CSS-hidden - the rail shows nothing
 * but the expand toggle (see Sidebar.module.css's `.sidebarCollapsed
 * .itemList`/`.sidebarCollapsed .sectionHeader` rules), rather than trying
 * to fit any icon, one-per-tile or one-per-category, into 3.75rem of width.
 */
function SidebarCategory({
  section,
  sidebarCollapsed,
  role,
  recentMap,
  categoryDrag,
}: SidebarCategoryProps) {
  const isCategory = section.label !== null;
  const scopeKey = section.label ?? '';
  const collapsedStorageKey = `sidebar-section-collapsed-${role}-${scopeKey}`;
  const sortStorageKey = `sidebar-section-sort-${role}-${scopeKey}`;
  const orderStorageKey = `sidebar-section-order-${role}-${scopeKey}`;

  const [categoryCollapsed, setCategoryCollapsed] = useState(
    () => isCategory && readStoredFlag(collapsedStorageKey)
  );
  const [sortKey, setSortKey] = useState<CategorySortKey>(() =>
    readStoredSort(sortStorageKey)
  );
  const [customOrder, setCustomOrder] = useState<string[] | null>(() =>
    readStoredOrder(orderStorageKey)
  );
  const [draggedTo, setDraggedTo] = useState<string | null>(null);
  const [dropTargetTo, setDropTargetTo] = useState<string | null>(null);

  function toggleCategoryCollapsed() {
    setCategoryCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(collapsedStorageKey, String(next));
      } catch {
        // best-effort only
      }
      return next;
    });
  }

  function changeSort(value: CategorySortKey) {
    setSortKey(value);
    try {
      window.localStorage.setItem(sortStorageKey, value);
    } catch {
      // best-effort only
    }
  }

  const baseItems = useMemo(
    () => applyCustomOrder(section.items, customOrder),
    [section.items, customOrder]
  );
  const orderedItems = useMemo(
    () => sortItems(baseItems, sortKey, recentMap),
    [baseItems, sortKey, recentMap]
  );

  // Icon-rail mode replaces a whole labeled category with a single icon
  // button below (see the early return) - a plain unlabeled section still
  // shows its items there, unchanged.
  const itemsHidden = categoryCollapsed && !sidebarCollapsed;
  // Deliberately independent of itemsHidden: the list is still in the DOM
  // (just visually collapsed) either way, so toggling collapse doesn't need
  // to change this. It used to include `&& !itemsHidden`, which mounted/
  // unmounted every item's grip handle - and reflowed every item's row -
  // the instant a category collapsed, which is what was actually causing
  // the reported "twitching" (not the collapse animation itself).
  const isDraggable = sortKey === 'custom' && !sidebarCollapsed;

  function handleDragStart(event: DragEvent<HTMLLIElement>, to: string) {
    setDraggedTo(to);
    event.dataTransfer.effectAllowed = 'move';
    // Firefox requires data to be set for a drag to start at all.
    event.dataTransfer.setData('text/plain', to);
  }

  // Only tracks which item the pointer is currently over, for the drop-
  // target highlight below - the actual reorder happens once, on drop (see
  // handleDrop). Reordering the array live on every dragenter used to move
  // the *actively-dragged* <li> around in the DOM mid-gesture, which is
  // unreliable across browsers (some cancel or scramble the drag entirely
  // when its own source node relocates while a drag is in progress) - this
  // was the cause of the reported "drag goes crazy" behavior.
  function handleDragEnter(overTo: string) {
    if (!draggedTo || draggedTo === overTo) return;
    setDropTargetTo(overTo);
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, overTo: string) {
    event.preventDefault();
    if (!draggedTo || draggedTo === overTo) {
      setDropTargetTo(null);
      return;
    }

    setCustomOrder((current) => {
      const order = (current ?? baseItems.map((item) => item.to)).slice();
      const fromIndex = order.indexOf(draggedTo);
      const toIndex = order.indexOf(overTo);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return current;
      }
      order.splice(fromIndex, 1);
      order.splice(toIndex, 0, draggedTo);
      persistOrder(orderStorageKey, order);
      return order;
    });
    setDropTargetTo(null);
  }

  function handleDragEnd() {
    setDraggedTo(null);
    setDropTargetTo(null);
  }

  // Lightweight FLIP animation: on every reorder, each item's new position
  // is measured against where it was before the reorder, and the resulting
  // jump is played backwards-then-forwards as a transform transition - so
  // dragging (and Alphabetical/Recently accessed switching the whole order
  // at once) both reflow smoothly instead of snapping.
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const prevTopsRef = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const nextTops = new Map<string, number>();
    itemRefs.current.forEach((element, to) => {
      nextTops.set(to, scrollInvariantTop(element));
    });

    prevTopsRef.current.forEach((prevTop, to) => {
      const nextTop = nextTops.get(to);
      const element = itemRefs.current.get(to);
      if (!element || nextTop === undefined) return;

      const deltaY = prevTop - nextTop;
      if (Math.abs(deltaY) < 0.5) return;

      element.style.transition = 'none';
      element.style.transform = `translateY(${deltaY}px)`;
      requestAnimationFrame(() => {
        element.style.transition = 'transform 200ms ease';
        element.style.transform = '';
      });
    });

    prevTopsRef.current = nextTops;
  }, [orderedItems]);

  const sortMenuItems: MoreOptionsMenuItem[] = SORT_OPTIONS.map((option) => ({
    label: `Sort: ${option.label}`,
    active: sortKey === option.value,
    onSelect: () => changeSort(option.value),
  }));

  return (
    <div
      className={
        [
          styles.section,
          categoryDrag?.isDragging ? styles.itemDragging : '',
          categoryDrag?.isDropTarget ? styles.itemDropTarget : '',
        ]
          .filter(Boolean)
          .join(' ') || undefined
      }
      ref={categoryDrag?.sectionRef}
      draggable={categoryDrag?.draggable}
      onDragStart={
        categoryDrag?.draggable ? categoryDrag.onDragStart : undefined
      }
      onDragEnter={
        categoryDrag?.draggable ? categoryDrag.onDragEnter : undefined
      }
      onDragOver={
        categoryDrag?.draggable ? (event) => event.preventDefault() : undefined
      }
      onDrop={categoryDrag?.draggable ? categoryDrag.onDrop : undefined}
      onDragEnd={categoryDrag?.draggable ? categoryDrag.onDragEnd : undefined}
    >
      <div
        className={isCategory ? styles.sectionHeader : styles.flatSectionHeader}
      >
        {categoryDrag?.draggable ? (
          <GripVertical
            size={14}
            aria-hidden="true"
            className={styles.dragHandle}
          />
        ) : null}
        {isCategory ? (
          <button
            type="button"
            className={styles.sectionToggle}
            onClick={toggleCategoryCollapsed}
            aria-expanded={!categoryCollapsed}
          >
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={
                categoryCollapsed
                  ? styles.sectionChevronCollapsed
                  : styles.sectionChevron
              }
            />
            <h2 className={styles.sectionLabel}>{section.label}</h2>
          </button>
        ) : null}
        <MoreOptionsMenu
          label={isCategory ? `Sort ${section.label}` : 'Sort'}
          items={sortMenuItems}
        />
      </div>
      <ul className={itemsHidden ? styles.itemListCollapsed : styles.itemList}>
        {orderedItems.map((item) => {
          const Icon = item.icon ?? section.icon;
          return (
            <li
              key={item.to}
              ref={(element) => {
                if (element) itemRefs.current.set(item.to, element);
                else itemRefs.current.delete(item.to);
              }}
              draggable={isDraggable}
              className={
                [
                  draggedTo === item.to ? styles.itemDragging : '',
                  dropTargetTo === item.to ? styles.itemDropTarget : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              onDragStart={(event) =>
                isDraggable && handleDragStart(event, item.to)
              }
              onDragEnter={() => isDraggable && handleDragEnter(item.to)}
              onDragOver={(event) => isDraggable && event.preventDefault()}
              onDrop={(event) => isDraggable && handleDrop(event, item.to)}
              onDragEnd={() => isDraggable && handleDragEnd()}
            >
              {isDraggable ? (
                <GripVertical
                  size={14}
                  aria-hidden="true"
                  className={styles.dragHandle}
                />
              ) : null}
              <NavLink
                to={item.to}
                draggable={false}
                className={({ isActive }) =>
                  isActive
                    ? `${styles.link} ${styles.linkActive}`
                    : styles.link
                }
                title={sidebarCollapsed ? item.title : undefined}
              >
                {Icon ? <Icon size={17} aria-hidden="true" /> : null}
                <span className={styles.linkText}>{item.title}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Collapsible left nav shared by the staff dashboard and customer portal
 * (AppShell). Admin/Superadmin see multiple labeled sections (their
 * dashboard config groups tiles by the lower-privilege role each belongs
 * to, since Admin/Superadmin can already reach all of them - see
 * staffDashboard.config.ts); every other role/the customer portal passes a
 * single `label: null` section, which renders identically to a flat list.
 * Once there's more than one labeled category, the categories themselves
 * can also be sorted/dragged into a custom order, same three modes and
 * mechanics as within a single category (see SidebarCategory) - unlabeled
 * sections (e.g. the "Dashboard" shortcut every role gets) sit outside that
 * reordering, always first.
 */
export function Sidebar({
  sections,
  collapsed,
  onToggleCollapse,
  role = 'staff',
}: SidebarProps) {
  const allItems = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections]
  );
  const recentMap = useRecentlyAccessed(role, allItems);

  const unlabeledSections = useMemo(
    () => sections.filter((section) => section.label === null),
    [sections]
  );
  const labeledSections = useMemo(
    () => sections.filter(isLabeledSection),
    [sections]
  );
  const hasMultipleCategories = labeledSections.length > 1;

  const categorySortStorageKey = `sidebar-category-sort-${role}`;
  const categoryOrderStorageKey = `sidebar-category-order-${role}`;

  const [categorySortKey, setCategorySortKey] = useState<CategorySortKey>(() =>
    readStoredSort(categorySortStorageKey)
  );
  const [categoryOrder, setCategoryOrder] = useState<string[] | null>(() =>
    readStoredOrder(categoryOrderStorageKey)
  );
  const [draggedLabel, setDraggedLabel] = useState<string | null>(null);
  const [dropTargetLabel, setDropTargetLabel] = useState<string | null>(null);

  function changeCategorySort(value: CategorySortKey) {
    setCategorySortKey(value);
    try {
      window.localStorage.setItem(categorySortStorageKey, value);
    } catch {
      // best-effort only
    }
  }

  const orderedLabeledSections = useMemo(() => {
    const base = applyCategoryOrder(labeledSections, categoryOrder);
    return sortCategories(base, categorySortKey, recentMap);
  }, [labeledSections, categoryOrder, categorySortKey, recentMap]);

  const isCategoryDraggable =
    hasMultipleCategories && categorySortKey === 'custom' && !collapsed;

  function handleCategoryDragStart(
    event: DragEvent<HTMLDivElement>,
    label: string
  ) {
    setDraggedLabel(label);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', label);
  }

  function handleCategoryDragEnter(overLabel: string) {
    if (!draggedLabel || draggedLabel === overLabel) return;
    setDropTargetLabel(overLabel);
  }

  function handleCategoryDrop(
    event: DragEvent<HTMLDivElement>,
    overLabel: string
  ) {
    event.preventDefault();
    if (!draggedLabel || draggedLabel === overLabel) {
      setDropTargetLabel(null);
      return;
    }

    setCategoryOrder((current) => {
      const order = (
        current ?? labeledSections.map((section) => section.label)
      ).slice();
      const fromIndex = order.indexOf(draggedLabel);
      const toIndex = order.indexOf(overLabel);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return current;
      }
      order.splice(fromIndex, 1);
      order.splice(toIndex, 0, draggedLabel);
      persistOrder(categoryOrderStorageKey, order);
      return order;
    });
    setDropTargetLabel(null);
  }

  function handleCategoryDragEnd() {
    setDraggedLabel(null);
    setDropTargetLabel(null);
  }

  // Same lightweight FLIP animation as SidebarCategory's own item reorder,
  // one level up - reordering categories reflows smoothly too.
  const categoryRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevCategoryTopsRef = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const nextTops = new Map<string, number>();
    categoryRefs.current.forEach((element, label) => {
      nextTops.set(label, scrollInvariantTop(element));
    });

    prevCategoryTopsRef.current.forEach((prevTop, label) => {
      const nextTop = nextTops.get(label);
      const element = categoryRefs.current.get(label);
      if (!element || nextTop === undefined) return;

      const deltaY = prevTop - nextTop;
      if (Math.abs(deltaY) < 0.5) return;

      element.style.transition = 'none';
      element.style.transform = `translateY(${deltaY}px)`;
      requestAnimationFrame(() => {
        element.style.transition = 'transform 200ms ease';
        element.style.transform = '';
      });
    });

    prevCategoryTopsRef.current = nextTops;
  }, [orderedLabeledSections]);

  const categorySortMenuItems: MoreOptionsMenuItem[] = SORT_OPTIONS.map(
    (option) => ({
      label: `Sort: ${option.label}`,
      active: categorySortKey === option.value,
      onSelect: () => changeCategorySort(option.value),
    })
  );

  return (
    <aside
      className={collapsed ? styles.sidebarCollapsed : styles.sidebar}
      aria-label="Dashboard navigation"
    >
      <button
        type="button"
        className={styles.collapseToggle}
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <PanelLeftOpen size={18} aria-hidden="true" />
        ) : (
          <PanelLeftClose size={18} aria-hidden="true" />
        )}
      </button>

      <nav className={styles.nav}>
        {unlabeledSections.map((section, index) => (
          <SidebarCategory
            key={`section-${index}`}
            section={section}
            sidebarCollapsed={collapsed}
            role={role}
            recentMap={recentMap}
          />
        ))}

        {hasMultipleCategories && !collapsed ? (
          <div className={styles.categorySortRow}>
            <span className={styles.categorySortLabel}>Categories</span>
            <MoreOptionsMenu
              label="Sort categories"
              items={categorySortMenuItems}
            />
          </div>
        ) : null}

        {orderedLabeledSections.map((section) => (
          <SidebarCategory
            key={section.label}
            section={section}
            sidebarCollapsed={collapsed}
            role={role}
            recentMap={recentMap}
            categoryDrag={{
              draggable: isCategoryDraggable,
              isDragging: draggedLabel === section.label,
              isDropTarget: dropTargetLabel === section.label,
              sectionRef: (element) => {
                if (element) categoryRefs.current.set(section.label, element);
                else categoryRefs.current.delete(section.label);
              },
              onDragStart: (event) =>
                handleCategoryDragStart(event, section.label),
              onDragEnter: () => handleCategoryDragEnter(section.label),
              onDrop: (event) => handleCategoryDrop(event, section.label),
              onDragEnd: handleCategoryDragEnd,
            }}
          />
        ))}
      </nav>
    </aside>
  );
}
