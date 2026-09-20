import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
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
import { Modal } from '../../../../shared/components/Modal/Modal';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type {
  CreateProductPayload,
  UpdateProductPayload,
} from '../../catalog.types';
import {
  applyCatalogFilters,
  buildCatalogFilterFields,
  buildCatalogGroupByAxes,
  CATALOG_COMPARATORS,
  CATALOG_SORT_FIELDS,
  deriveCatalogSortKey,
  matchesCatalogQuery,
} from './catalogBrowserFields';
import styles from './CatalogAdminPage.module.css';

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  service_scope: string;
  price: number;
  is_active: boolean;
  archived_at?: string | null;
}

interface CatalogApiResult<T> {
  data: T | null;
  error: string | null;
}

interface CatalogAdminPageProps {
  title: string;
  itemNoun: string;
  accessToken: string;
  /** Suggested category/service_scope values shown as quick-pick options in
   * the Add form (the fields stay free text - see catalog.types.ts's own
   * "documented, not enforced" convention) - defaults cover the values this
   * unification ships with. */
  categoryOptions?: string[];
  serviceScopeOptions?: string[];
  listItems: (accessToken: string) => Promise<CatalogApiResult<CatalogItem[]>>;
  createItem: (
    payload: CreateProductPayload,
    accessToken: string
  ) => Promise<CatalogApiResult<CatalogItem>>;
  updateItem: (
    itemId: string,
    payload: UpdateProductPayload,
    accessToken: string
  ) => Promise<CatalogApiResult<CatalogItem>>;
  /** Soft: moves the item to the archive. Server requires is_active ===
   * false first - the Archive button below is disabled until then. */
  archiveItem: (
    itemId: string,
    accessToken: string
  ) => Promise<CatalogApiResult<null>>;
  /** Which tab of /staff/admin/archive the "View archive" link opens. */
  archiveTab: string;
}

const DEFAULT_CATEGORY_OPTIONS = ['food', 'medication', 'misc_retail'];
const DEFAULT_SERVICE_SCOPE_OPTIONS = ['hotel', 'general'];
const CUSTOM_OPTION = '__custom__';

/**
 * Sprint 5 unification (#82): generalized from the #79-revision food/
 * medication-only version - now carries category/service_scope so one page
 * (ProductCatalogPage) manages every catalog item (hotel food, hotel
 * medication, and future retail products) instead of two near-duplicate
 * pages. A category filter narrows the visible list; the Add form always
 * captures category + service_scope alongside name/price.
 */
export function CatalogAdminPage({
  title,
  itemNoun,
  accessToken,
  categoryOptions = DEFAULT_CATEGORY_OPTIONS,
  serviceScopeOptions = DEFAULT_SERVICE_SCOPE_OPTIONS,
  listItems,
  createItem,
  updateItem,
  archiveItem,
  archiveTab,
}: CatalogAdminPageProps) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState(categoryOptions[0] ?? '');
  const [customCategory, setCustomCategory] = useState('');
  const [newServiceScope, setNewServiceScope] = useState(
    serviceScopeOptions[0] ?? ''
  );
  const [customServiceScope, setCustomServiceScope] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPrice, setEditingPrice] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState('category');

  useEffect(() => {
    void listItems(accessToken).then((result) => {
      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? `Could not load the ${itemNoun} catalog.`);
        return;
      }

      setItems(result.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const filterFields = useMemo(() => buildCatalogFilterFields(items), [items]);
  const groupByAxes = useMemo(() => buildCatalogGroupByAxes(items), [items]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? items.filter((item) => matchesCatalogQuery(item, query))
      : items;
    const filtered = applyCatalogFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(
      CATALOG_COMPARATORS[deriveCatalogSortKey(sortTile)]
    );
  }, [items, search, filterTiles, sortTile]);

  const activeGroupAxis =
    groupByAxes.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedItems = useGroupBy(
    visibleItems,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = filterFields.find((f) => f.id === fieldId);
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

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const price = Number(newPrice);
    const category =
      newCategory === CUSTOM_OPTION ? customCategory.trim() : newCategory;
    const serviceScope =
      newServiceScope === CUSTOM_OPTION
        ? customServiceScope.trim()
        : newServiceScope;

    if (
      !newName.trim() ||
      !category ||
      !serviceScope ||
      Number.isNaN(price) ||
      price < 0
    ) {
      setFormError(
        'Name, category, service scope, and a non-negative price are required.'
      );
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const result = await createItem(
      {
        name: newName.trim(),
        category,
        service_scope: serviceScope,
        price,
      },
      accessToken
    );

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? `Could not add ${itemNoun}.`);
      return;
    }

    setItems((prev) => [...prev, result.data as CatalogItem]);
    setNewName('');
    setNewPrice('');
    setCustomCategory('');
    setCustomServiceScope('');
    setMessage(`${itemNoun} added.`);
    setIsCreateModalOpen(false);
  }

  function openCreateModal() {
    setFormError(null);
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setFormError(null);
  }

  function startEditing(item: CatalogItem) {
    setEditingId(item.id);
    setEditingName(item.name);
    setEditingPrice(String(item.price));
    setRowError(null);
  }

  async function handleSaveEdit(itemId: string) {
    const price = Number(editingPrice);

    if (!editingName.trim() || Number.isNaN(price) || price < 0) {
      setRowError('Name and a non-negative price are required.');
      return;
    }

    setRowError(null);

    const result = await updateItem(
      itemId,
      { name: editingName.trim(), price },
      accessToken
    );

    if (result.error || !result.data) {
      setRowError(result.error ?? `Could not update ${itemNoun}.`);
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? (result.data as CatalogItem) : item
      )
    );
    setEditingId(null);
    setMessage(`${itemNoun} updated.`);
  }

  async function handleToggleActive(item: CatalogItem) {
    setRowError(null);

    const result = await updateItem(
      item.id,
      { is_active: !item.is_active },
      accessToken
    );

    if (result.error || !result.data) {
      setRowError(result.error ?? `Could not update ${itemNoun}.`);
      return;
    }

    setItems((prev) =>
      prev.map((existing) =>
        existing.id === item.id ? (result.data as CatalogItem) : existing
      )
    );
  }

  async function handleArchive(itemId: string) {
    setRowError(null);

    const result = await archiveItem(itemId, accessToken);

    if (result.error) {
      setRowError(result.error);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== itemId));
    setMessage(`${itemNoun} archived.`);
  }

  function renderItemActions(item: CatalogItem) {
    if (editingId === item.id) {
      return (
        <>
          <button
            type="button"
            className={styles.smallButton}
            onClick={() => void handleSaveEdit(item.id)}
          >
            Save
          </button>
          <button
            type="button"
            className={styles.smallButtonSecondary}
            onClick={() => setEditingId(null)}
          >
            Cancel
          </button>
        </>
      );
    }

    return (
      <>
        <button
          type="button"
          className={styles.smallButtonSecondary}
          onClick={() => startEditing(item)}
        >
          Edit
        </button>
        <button
          type="button"
          className={styles.smallButtonSecondary}
          onClick={() => void handleToggleActive(item)}
        >
          {item.is_active ? 'Deactivate' : 'Activate'}
        </button>
        {!item.is_active ? (
          <button
            type="button"
            className={styles.smallButtonSecondary}
            onClick={() => void handleArchive(item.id)}
          >
            Archive
          </button>
        ) : null}
      </>
    );
  }

  const columns: DataTableColumn<CatalogItem>[] = [
    {
      id: 'name',
      header: 'Name',
      render: (item) =>
        editingId === item.id ? (
          <input
            className={styles.input}
            value={editingName}
            onChange={(event) => setEditingName(event.target.value)}
          />
        ) : (
          <span className={styles.itemName}>
            {item.name}
            <span className={styles.categoryBadge}>{item.category}</span>
            {!item.is_active ? (
              <span className={styles.inactiveBadge}>Inactive</span>
            ) : null}
          </span>
        ),
    },
    {
      id: 'serviceScope',
      header: 'Service scope',
      render: (item) => item.service_scope,
    },
    {
      id: 'price',
      header: 'Price',
      align: 'end',
      render: (item) =>
        editingId === item.id ? (
          <input
            className={styles.input}
            type="number"
            min="0"
            step="0.01"
            value={editingPrice}
            onChange={(event) => setEditingPrice(event.target.value)}
          />
        ) : (
          <span className={styles.itemPrice}>PHP {item.price.toFixed(2)}</span>
        ),
    },
  ];

  function renderItemCard(item: CatalogItem) {
    if (editingId === item.id) {
      return (
        <>
          <input
            className={styles.input}
            value={editingName}
            onChange={(event) => setEditingName(event.target.value)}
          />
          <input
            className={styles.input}
            type="number"
            min="0"
            step="0.01"
            value={editingPrice}
            onChange={(event) => setEditingPrice(event.target.value)}
          />
          {renderItemActions(item)}
        </>
      );
    }

    return (
      <>
        <span className={styles.itemName}>
          {item.name}
          <span className={styles.categoryBadge}>{item.category}</span>
          {!item.is_active ? (
            <span className={styles.inactiveBadge}>Inactive</span>
          ) : null}
        </span>
        <span className={styles.itemPrice}>PHP {item.price.toFixed(2)}</span>
        {renderItemActions(item)}
      </>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.titleRowActions}>
            <button
              type="button"
              className={styles.button}
              onClick={openCreateModal}
            >
              Add {itemNoun}
            </button>
            <Link
              className={styles.archiveLink}
              to={`/staff/admin/archive?tab=${archiveTab}`}
            >
              View archive
            </Link>
          </div>
        </div>

        {message ? <p className={styles.successBanner}>{message}</p> : null}

        {isLoading ? (
          <p className={styles.copy}>Loading {itemNoun} catalog...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <>
            <FilterSortBar
              filterFields={filterFields}
              filterTiles={filterTiles}
              onAddFilter={handleAddFilter}
              onChangeFilter={handleChangeFilter}
              onRemoveFilter={handleRemoveFilter}
              sortFields={CATALOG_SORT_FIELDS}
              sortTile={sortTile}
              onChangeSort={setSortTile}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={`Search ${itemNoun}s by name or category...`}
            >
              <div className={styles.toolbar}>
                <ViewSwitcher
                  options={VIEW_OPTIONS}
                  value={view}
                  onChange={setView}
                  ariaLabel={`${title} view`}
                />
                {view === 'board' ? (
                  <label className={styles.field}>
                    <span className={styles.label}>Group by</span>
                    <select
                      className={styles.input}
                      value={groupAxisId}
                      onChange={(event) => setGroupAxisId(event.target.value)}
                      aria-label="Group by"
                    >
                      {groupByAxes.map((axis) => (
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
                rows={visibleItems}
                getRowKey={(item) => item.id}
                renderRowActions={renderItemActions}
                emptyMessage={`No ${itemNoun} items match this filter.`}
              />
            ) : view === 'list' ? (
              <DataList
                items={visibleItems}
                getRowKey={(item) => item.id}
                renderItem={(item) => (
                  <div className={styles.rowMain}>{renderItemCard(item)}</div>
                )}
                emptyMessage={`No ${itemNoun} items match this filter.`}
              />
            ) : (
              <DataBoard
                groups={groupedItems}
                getRowKey={(item) => item.id}
                renderCard={(item) => (
                  <div className={styles.listItem}>{renderItemCard(item)}</div>
                )}
                emptyColumnMessage={`No ${itemNoun} items here.`}
              />
            )}
          </>
        )}

        {rowError ? (
          <p className={styles.errorBanner} role="alert">
            {rowError}
          </p>
        ) : null}
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        title={`Add ${itemNoun}`}
        onClose={closeCreateModal}
      >
        <form
          className={styles.form}
          onSubmit={(event) => void handleCreate(event)}
        >
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input
              className={styles.input}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Category</span>
            <select
              className={styles.input}
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
            >
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value={CUSTOM_OPTION}>Other (custom)...</option>
            </select>
            {newCategory === CUSTOM_OPTION ? (
              <input
                className={styles.input}
                placeholder="Custom category"
                value={customCategory}
                onChange={(event) => setCustomCategory(event.target.value)}
              />
            ) : null}
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Service scope</span>
            <select
              className={styles.input}
              value={newServiceScope}
              onChange={(event) => setNewServiceScope(event.target.value)}
            >
              {serviceScopeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value={CUSTOM_OPTION}>Other (custom)...</option>
            </select>
            {newServiceScope === CUSTOM_OPTION ? (
              <input
                className={styles.input}
                placeholder="Custom service scope"
                value={customServiceScope}
                onChange={(event) => setCustomServiceScope(event.target.value)}
              />
            ) : null}
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Price (PHP)</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              step="0.01"
              value={newPrice}
              onChange={(event) => setNewPrice(event.target.value)}
            />
          </label>
          {formError ? (
            <p className={styles.errorBanner} role="alert">
              {formError}
            </p>
          ) : null}
          <button
            className={styles.button}
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Adding...' : `Add ${itemNoun}`}
          </button>
        </form>
      </Modal>
    </main>
  );
}
