import { useEffect, useMemo, useState } from 'react';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  archiveCustomerCatalogItem,
  createCustomerCatalogItem,
  listCustomerCatalog,
  updateCustomerCatalogItem,
} from '../../api/catalog.api';
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
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type {
  CustomerCatalogCategory,
  ProductCatalogItem,
} from '../../catalog.types';
import {
  applyCustomerCatalogFilters,
  CATEGORY_FILTER_FIELDS,
  CUSTOMER_CATALOG_COMPARATORS,
  CUSTOMER_CATALOG_GROUP_BY_AXES,
  CUSTOMER_CATALOG_SORT_FIELDS,
  deriveCustomerCatalogSortKey,
  matchesCustomerCatalogQuery,
} from './customerCatalogBrowserFields';
import styles from './CustomerFoodMedicationPage.module.css';

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

/**
 * #22: a customer's own reusable food/medication "types", selectable on
 * future hotel bookings - staff no longer buy food/medication on a
 * customer's behalf, so this moved from a staff-only check-in step to
 * customer-managed CRUD. Reachable standalone (this page, /portal/food-
 * medication) as well as from the hotel booking wizard's Care Instructions
 * step. `listCustomerCatalog` can still return global (owner_customer_id
 * null) rows if any exist, but every row this page's own CRUD creates is
 * always owned by the viewing customer, so all rows render as editable.
 *
 * Notion-style remaster (session 110): per the Ideas backlog ("combine the
 * food items and medications into one list/table... Notion like search,
 * filter, sort and group by... table, list and board view options"), the
 * old two-section (Food / Medication) layout is now one combined browser -
 * Board view grouped by Category reproduces the old sections. Rename/
 * Remove moved from always-visible buttons to a "..." menu, matching every
 * other admin/customer list in this rollout.
 */
export function CustomerFoodMedicationPage() {
  const { user, accessToken } = useAuth();
  const [items, setItems] = useState<ProductCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] =
    useState<CustomerCatalogCategory>('food');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId] = useState(CUSTOMER_CATALOG_GROUP_BY_AXES[0].id);

  const loadItems = () => {
    if (!accessToken) return;
    void listCustomerCatalog(accessToken).then((result) => {
      setIsLoading(false);
      if (result.data) setItems(result.data);
    });
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? items.filter((item) => matchesCustomerCatalogQuery(item, query))
      : items;
    const filtered = applyCustomerCatalogFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(
      CUSTOMER_CATALOG_COMPARATORS[deriveCustomerCatalogSortKey(sortTile)]
    );
  }, [items, search, filterTiles, sortTile]);

  const activeGroupAxis =
    CUSTOMER_CATALOG_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ??
    null;
  const groupedItems = useGroupBy(
    visibleItems,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = CATEGORY_FILTER_FIELDS.find((f) => f.id === fieldId);
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

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your food/medication types.
        </p>
      </main>
    );
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const result = await createCustomerCatalogItem(
      { name: newName.trim(), category: newCategory },
      accessToken
    );

    if (!result.data) {
      setError(result.error ?? 'Could not add this type.');
      return;
    }

    setItems((prev) => [...prev, result.data as ProductCatalogItem]);
    setNewName('');
    setMessage('Added.');
  };

  const handleRename = async (itemId: string) => {
    setError(null);
    const result = await updateCustomerCatalogItem(
      itemId,
      editingName.trim(),
      accessToken
    );

    if (!result.data) {
      setError(result.error ?? 'Could not rename this type.');
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? (result.data as ProductCatalogItem) : item
      )
    );
    setEditingId(null);
  };

  const handleRemove = async (itemId: string) => {
    setError(null);
    const result = await archiveCustomerCatalogItem(itemId, accessToken);

    if (result.error) {
      setError(result.error);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  function startEditing(item: ProductCatalogItem) {
    setEditingId(item.id);
    setEditingName(item.name);
  }

  function renderItemActions(item: ProductCatalogItem) {
    if (editingId === item.id) {
      return (
        <div className={styles.itemActions}>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => void handleRename(item.id)}
          >
            Save
          </button>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setEditingId(null)}
          >
            Cancel
          </button>
        </div>
      );
    }

    return (
      <MoreOptionsMenu
        label={`Actions for ${item.name}`}
        items={[
          { label: 'Rename', onSelect: () => startEditing(item) },
          { label: 'Remove', onSelect: () => void handleRemove(item.id) },
        ]}
      />
    );
  }

  const columns: DataTableColumn<ProductCatalogItem>[] = [
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
          <span className={styles.itemName}>{item.name}</span>
        ),
    },
    {
      id: 'category',
      header: 'Category',
      render: (item) => (item.category === 'food' ? 'Food' : 'Medication'),
    },
  ];

  function renderItemContent(item: ProductCatalogItem) {
    return (
      <>
        {editingId === item.id ? (
          <input
            className={styles.input}
            value={editingName}
            onChange={(event) => setEditingName(event.target.value)}
          />
        ) : (
          <span className={styles.itemName}>
            {item.name} ({item.category === 'food' ? 'Food' : 'Medication'})
          </span>
        )}
        {renderItemActions(item)}
      </>
    );
  }

  function renderItemRow(item: ProductCatalogItem) {
    return <div className={styles.rowContent}>{renderItemContent(item)}</div>;
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>My Food &amp; Medication Types</h1>
      <p className={styles.copy}>
        Save your pet&apos;s usual food and medication here so you can pick them
        quickly on future hotel bookings.
      </p>

      {message ? <p className={styles.successBanner}>{message}</p> : null}
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <p className={styles.copy}>Loading...</p>
      ) : (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>Your types</h2>

          <FilterSortBar
            filterFields={CATEGORY_FILTER_FIELDS}
            filterTiles={filterTiles}
            onAddFilter={handleAddFilter}
            onChangeFilter={handleChangeFilter}
            onRemoveFilter={handleRemoveFilter}
            sortFields={CUSTOMER_CATALOG_SORT_FIELDS}
            sortTile={sortTile}
            onChangeSort={setSortTile}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search your types..."
          >
            <ViewSwitcher
              options={VIEW_OPTIONS}
              value={view}
              onChange={setView}
              ariaLabel="Food and medication view"
            />
          </FilterSortBar>

          {view === 'table' ? (
            <DataTable
              columns={columns}
              rows={visibleItems}
              getRowKey={(item) => item.id}
              renderRowActions={renderItemActions}
              emptyMessage="No types match this filter."
            />
          ) : view === 'list' ? (
            <DataList
              items={visibleItems}
              getRowKey={(item) => item.id}
              renderItem={renderItemRow}
              emptyMessage="No types match this filter."
            />
          ) : (
            <DataBoard
              groups={groupedItems}
              getRowKey={(item) => item.id}
              renderCard={(item) => (
                <div className={styles.item}>{renderItemContent(item)}</div>
              )}
              emptyColumnMessage="No types here."
            />
          )}
        </section>
      )}

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Add a new type</h2>
        <form
          className={styles.form}
          onSubmit={(event) => void handleCreate(event)}
        >
          <input
            className={styles.input}
            placeholder="e.g. Chicken kibble, Amoxicillin"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            required
          />
          <select
            className={styles.select}
            value={newCategory}
            onChange={(event) =>
              setNewCategory(event.target.value as CustomerCatalogCategory)
            }
          >
            <option value="food">Food</option>
            <option value="medication">Medication</option>
          </select>
          <button className={styles.button} type="submit">
            Add
          </button>
        </form>
      </section>
    </main>
  );
}
