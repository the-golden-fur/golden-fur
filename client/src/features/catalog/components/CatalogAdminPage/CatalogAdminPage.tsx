import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  CreateProductPayload,
  UpdateProductPayload,
} from '../../catalog.types';
import styles from './CatalogAdminPage.module.css';

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  service_scope: string;
  price: number;
  is_active: boolean;
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
  deleteItem: (
    itemId: string,
    accessToken: string
  ) => Promise<CatalogApiResult<null>>;
}

const DEFAULT_CATEGORY_OPTIONS = ['food', 'medication', 'misc_retail'];
const DEFAULT_SERVICE_SCOPE_OPTIONS = ['hotel', 'general'];
const ALL_CATEGORIES = '__all__';
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
  deleteItem,
}: CatalogAdminPageProps) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPrice, setEditingPrice] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

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

  const knownCategories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category))).sort(),
    [items]
  );

  const visibleItems =
    categoryFilter === ALL_CATEGORIES
      ? items
      : items.filter((item) => item.category === categoryFilter);

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

  async function handleDelete(itemId: string) {
    setRowError(null);

    const result = await deleteItem(itemId, accessToken);

    if (result.error) {
      setRowError(result.error);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== itemId));
    setMessage(`${itemNoun} deleted.`);
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>{title}</h1>

        {message ? <p className={styles.successBanner}>{message}</p> : null}

        <section className={styles.panel} aria-labelledby="add-item-title">
          <h2 className={styles.sectionTitle} id="add-item-title">
            Add {itemNoun}
          </h2>
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
                  onChange={(event) =>
                    setCustomServiceScope(event.target.value)
                  }
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
        </section>

        {knownCategories.length > 0 ? (
          <label className={styles.field}>
            <span className={styles.label}>Filter by category</span>
            <select
              className={styles.input}
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value={ALL_CATEGORIES}>All categories</option>
              {knownCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {isLoading ? (
          <p className={styles.copy}>Loading {itemNoun} catalog...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : visibleItems.length === 0 ? (
          <p className={styles.copy}>No {itemNoun} items yet.</p>
        ) : (
          <ul className={styles.list}>
            {visibleItems.map((item) => (
              <li className={styles.listItem} key={item.id}>
                {editingId === item.id ? (
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
                ) : (
                  <>
                    <span className={styles.itemName}>
                      {item.name}
                      <span className={styles.categoryBadge}>
                        {item.category}
                      </span>
                      {!item.is_active ? (
                        <span className={styles.inactiveBadge}>Inactive</span>
                      ) : null}
                    </span>
                    <span className={styles.itemPrice}>
                      PHP {item.price.toFixed(2)}
                    </span>
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
                    <button
                      type="button"
                      className={styles.smallButtonSecondary}
                      onClick={() => void handleDelete(item.id)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {rowError ? (
          <p className={styles.errorBanner} role="alert">
            {rowError}
          </p>
        ) : null}
      </div>
    </main>
  );
}
