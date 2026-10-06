import { useMemo, useState } from 'react';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
import { DataBoard } from '../../../../shared/components/DataBoard/DataBoard';
import { DataList } from '../../../../shared/components/DataList/DataList';
import {
  DataTable,
  type DataTableColumn,
} from '../../../../shared/components/DataTable/DataTable';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { CardContextMenu } from '../../../../shared/components/MoreOptionsMenu/CardContextMenu';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import {
  applyCapFilters,
  CAP_COMPARATORS,
  CAP_FILTER_FIELDS,
  CAP_GROUP_BY_AXES,
  CAP_SORT_FIELDS,
  deriveCapSortKey,
  describeCap,
  matchesCapQuery,
  type CapRow,
} from './promoCapBrowserFields';
import styles from './PromoCapBrowser.module.css';

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

interface PromoCapBrowserProps {
  rows: CapRow[];
  onConfigure: (branchId: string) => void;
}

/**
 * Promo Cap Configuration's per-branch list, with the same search / filter /
 * sort / group-by / view controls as every other config page. The cap
 * editing modal itself stays on the Promos page - this only browses the rows
 * and reports which branch's Configure was picked. Table and list rows have a
 * visible "..." menu (list cards also open it with right-click / press-and-
 * hold); board cards use right-click / press-and-hold only.
 */
export function PromoCapBrowser({ rows, onConfigure }: PromoCapBrowserProps) {
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState(CAP_GROUP_BY_AXES[0].id);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? rows.filter((row) => matchesCapQuery(row, query))
      : rows;
    const filtered = applyCapFilters(searched, filterTiles);

    return [...filtered].sort(CAP_COMPARATORS[deriveCapSortKey(sortTile)]);
  }, [rows, search, filterTiles, sortTile]);

  const activeGroupAxis =
    CAP_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedRows = useGroupBy(
    visibleRows,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = CAP_FILTER_FIELDS.find((f) => f.id === fieldId);
    if (!field) return;
    setFilterTiles((prev) => [...prev, { fieldId, value: field.defaultValue }]);
  }

  function handleChangeFilter(fieldId: string, value: FilterValue) {
    setFilterTiles((prev) =>
      prev.map((tile) => (tile.fieldId === fieldId ? { ...tile, value } : tile))
    );
  }

  function handleRemoveFilter(fieldId: string) {
    setFilterTiles((prev) => prev.filter((tile) => tile.fieldId !== fieldId));
  }

  function menuItems(row: CapRow): MoreOptionsMenuItem[] {
    return [{ label: 'Configure', onSelect: () => onConfigure(row.branchId) }];
  }

  function renderCapSummary(row: CapRow) {
    return row.config ? (
      <span className={styles.categoryBadge}>{describeCap(row.config)}</span>
    ) : (
      <span className={styles.capRowNote}>No cap saved yet</span>
    );
  }

  function renderRowMenu(row: CapRow) {
    return (
      <MoreOptionsMenu
        label={`Actions for ${row.branchName}`}
        items={menuItems(row)}
      />
    );
  }

  const columns: DataTableColumn<CapRow>[] = [
    {
      id: 'branch',
      header: 'Branch',
      render: (row) => (
        <span className={styles.capBranchName}>{row.branchName}</span>
      ),
    },
    {
      id: 'cap',
      header: 'Cap',
      render: renderCapSummary,
    },
  ];

  return (
    <>
      <FilterSortBar
        filterFields={CAP_FILTER_FIELDS}
        filterTiles={filterTiles}
        onAddFilter={handleAddFilter}
        onChangeFilter={handleChangeFilter}
        onRemoveFilter={handleRemoveFilter}
        sortFields={CAP_SORT_FIELDS}
        sortTile={sortTile}
        onChangeSort={setSortTile}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search branches..."
      >
        <div className={styles.viewControls}>
          <ViewSwitcher
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
            ariaLabel="Promo caps view"
          />
          {view === 'board' ? (
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Group by</span>
              <select
                className={styles.filterSelect}
                value={groupAxisId}
                onChange={(event) => setGroupAxisId(event.target.value)}
                aria-label="Group by"
              >
                {CAP_GROUP_BY_AXES.map((axis) => (
                  <option key={axis.id} value={axis.id}>
                    {axis.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </FilterSortBar>

      {view === 'table' ? (
        <DataTable
          columns={columns}
          rows={visibleRows}
          getRowKey={(row) => row.branchId}
          renderRowActions={renderRowMenu}
          emptyMessage="No branches match the selected filters."
        />
      ) : view === 'list' ? (
        <DataList
          items={visibleRows}
          getRowKey={(row) => row.branchId}
          emptyMessage="No branches match the selected filters."
          renderItem={(row) => (
            <CardContextMenu
              label={`Actions for ${row.branchName}`}
              items={menuItems(row)}
            >
              <div className={styles.capRow}>
                <div className={styles.capRowMain}>
                  <span className={styles.capBranchName}>{row.branchName}</span>
                  {renderCapSummary(row)}
                </div>
                {renderRowMenu(row)}
              </div>
            </CardContextMenu>
          )}
        />
      ) : (
        <DataBoard
          groups={groupedRows}
          getRowKey={(row) => row.branchId}
          emptyColumnMessage="No branches here."
          renderCard={(row) => (
            <div className={styles.boardCard}>
              <CardContextMenu
                label={`Actions for ${row.branchName}`}
                items={menuItems(row)}
              >
                <div className={styles.capRowMain}>
                  <span className={styles.capBranchName}>{row.branchName}</span>
                  {renderCapSummary(row)}
                </div>
              </CardContextMenu>
            </div>
          )}
        />
      )}
    </>
  );
}
