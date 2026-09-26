import { useMemo, useState } from 'react';
import { LayoutGrid, List as ListIcon } from 'lucide-react';
import { DashboardTile } from '../../../features/staff/components/dashboard/DashboardTile/DashboardTile';
import { FilterSortBar } from '../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterField,
  FilterTile,
  FilterValue,
  SortFieldDescriptor,
  SortTile,
} from '../../../shared/components/FilterSortBar/filterField.types';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../shared/components/ViewSwitcher/ViewSwitcher';
import {
  BRANCHES_TILE,
  CONFIG_TILES,
  type ConfigTileConfig,
} from '../configTiles.config';
import styles from '../SettingsPage.module.css';

interface ConfigTabProps {
  isSuperadmin: boolean;
  /** Custom change (Settings > Config subtiles): selecting a tile embeds its
   * page inline inside the Settings modal instead of navigating away - see
   * SettingsPage.tsx, which owns the actual embedded rendering and passes
   * this handler down. */
  onSelectTile: (tile: ConfigTileConfig) => void;
}

type ConfigViewMode = 'grid' | 'list';

const VIEW_OPTIONS: ViewSwitcherOption<ConfigViewMode>[] = [
  { value: 'grid', label: 'Grid', icon: LayoutGrid },
  { value: 'list', label: 'List', icon: ListIcon },
];

const ACCESS_FILTER_FIELD_ID = 'access';

const ACCESS_FILTER_FIELD: FilterField = {
  id: ACCESS_FILTER_FIELD_ID,
  label: 'Access',
  type: 'select',
  defaultValue: 'all',
  options: [
    { value: 'all', label: 'Admin & Superadmin' },
    { value: 'superadmin', label: 'Superadmin only' },
  ],
  formatValue: (value) =>
    value === 'superadmin' ? 'Superadmin only' : 'Admin & Superadmin',
};

const SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A → Z' },
      { value: 'desc', label: 'Z → A' },
    ],
  },
];

interface ConfigTileWithAccess extends ConfigTileConfig {
  superadminOnly: boolean;
}

/**
 * Settings > Config (Admin/Superadmin only). One entry point for every
 * admin-config page - the pages themselves (maintenance.routes.tsx,
 * discounts.routes.tsx) are untouched; only their entry surface moved here
 * from the admin dashboard, which now holds only day-to-day operational
 * tiles (see staffDashboard.config.ts). Branches (formerly "System
 * Configuration") is Superadmin-only, matching that page's own
 * ALLOWED_VIEWER_ROLES gate.
 *
 * Custom change (search/sort/filter + list/grid): the same FilterSortBar +
 * ViewSwitcher pattern used on pages like Discounts, applied to this tile
 * list itself rather than to a table of records - "Grid" is the original
 * card layout, "List" stacks each tile as a full-width row. "Access" is the
 * one real filterable attribute a static tile list has (every tile here is
 * Admin+Superadmin except Branches, which is Superadmin-only).
 */
export function ConfigTab({ isSuperadmin, onSelectTile }: ConfigTabProps) {
  const allTiles = useMemo<ConfigTileWithAccess[]>(() => {
    const tiles = CONFIG_TILES.map((tile) => ({
      ...tile,
      superadminOnly: false,
    }));
    return isSuperadmin
      ? [...tiles, { ...BRANCHES_TILE, superadminOnly: true }]
      : tiles;
  }, [isSuperadmin]);

  const [search, setSearch] = useState('');
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [view, setView] = useState<ConfigViewMode>('grid');

  const accessFilterValue = filterTiles.find(
    (tile) => tile.fieldId === ACCESS_FILTER_FIELD_ID
  )?.value;

  const visibleTiles = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = allTiles.filter((tile) => {
      const matchesQuery =
        !query ||
        tile.title.toLowerCase().includes(query) ||
        tile.description.toLowerCase().includes(query);
      const matchesAccess =
        !accessFilterValue ||
        accessFilterValue === 'all' ||
        tile.superadminOnly;
      return matchesQuery && matchesAccess;
    });

    if (!sortTile) return filtered;

    return [...filtered].sort((a, b) =>
      sortTile.direction === 'desc'
        ? b.title.localeCompare(a.title)
        : a.title.localeCompare(b.title)
    );
  }, [allTiles, search, accessFilterValue, sortTile]);

  function handleAddFilter(fieldId: string) {
    setFilterTiles((prev) => [
      ...prev,
      { fieldId, value: ACCESS_FILTER_FIELD.defaultValue },
    ]);
  }

  function handleChangeFilter(fieldId: string, value: FilterValue) {
    setFilterTiles((prev) =>
      prev.map((tile) => (tile.fieldId === fieldId ? { ...tile, value } : tile))
    );
  }

  function handleRemoveFilter(fieldId: string) {
    setFilterTiles((prev) => prev.filter((tile) => tile.fieldId !== fieldId));
  }

  return (
    <div className={styles.configTabContent}>
      <FilterSortBar
        filterFields={[ACCESS_FILTER_FIELD]}
        filterTiles={filterTiles}
        onAddFilter={handleAddFilter}
        onChangeFilter={handleChangeFilter}
        onRemoveFilter={handleRemoveFilter}
        sortFields={SORT_FIELDS}
        sortTile={sortTile}
        onChangeSort={setSortTile}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search config..."
      >
        <ViewSwitcher
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
          ariaLabel="Config layout"
        />
      </FilterSortBar>

      {visibleTiles.length === 0 ? (
        <p className={styles.copy}>No config sections match your search.</p>
      ) : (
        <div className={view === 'grid' ? styles.grid : styles.list}>
          {visibleTiles.map((tile) => (
            <DashboardTile
              key={tile.title}
              title={tile.title}
              description={tile.description}
              icon={tile.icon}
              onSelect={() => onSelectTile(tile)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
