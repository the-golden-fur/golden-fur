import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import {
  Columns3,
  List as ListIcon,
  Plus,
  Table as TableIcon,
} from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import {
  archiveFoodItem,
  archiveMedicationItem,
  createFoodItem,
  createMedicationItem,
  listMyFoodItems,
  listMyMedicationItems,
  listPickableFoodItems,
  listPickableMedicationItems,
  updateFoodItem,
  updateMedicationItem,
} from '../../api/staffItems.api';
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
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { ToggleSwitch } from '../../../../shared/components/ToggleSwitch/ToggleSwitch';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import {
  FOOD_QUANTITY_UNITS,
  MEDICATION_DOSE_UNITS,
  STAFF_ITEM_ADMIN_ROLES,
  STAFF_ITEM_ROLES,
  type FoodQuantityUnit,
  type MedicationDoseUnit,
  type StaffCatalogItem,
} from '../../staffItems.types';
import {
  applyStaffItemFilters,
  deriveStaffItemSortKey,
  matchesStaffItemQuery,
  STAFF_ITEM_COMPARATORS,
  STAFF_ITEM_FILTER_FIELDS,
  STAFF_ITEM_GROUP_BY_AXES,
  STAFF_ITEM_SORT_FIELDS,
} from './staffItemBrowserFields';
import styles from './StaffFoodMedicationItemsPage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

const ALLOWED_VIEWER_ROLES = new Set<string>(STAFF_ITEM_ROLES);
const ADMIN_ROLE_SET = new Set<string>(STAFF_ITEM_ADMIN_ROLES);

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

type AddStep = 'choose' | 'food' | 'medication';

interface FoodFormState {
  name: string;
  quantity: string;
  quantity_unit: FoodQuantityUnit | '';
  special_instructions: string;
  is_public: boolean;
}

const EMPTY_FOOD_FORM: FoodFormState = {
  name: '',
  quantity: '',
  quantity_unit: '',
  special_instructions: '',
  is_public: false,
};

interface MedicationFormState {
  name: string;
  dose: string;
  dose_unit: MedicationDoseUnit | '';
  administration_notes: string;
  is_public: boolean;
}

const EMPTY_MEDICATION_FORM: MedicationFormState = {
  name: '',
  dose: '',
  dose_unit: '',
  administration_notes: '',
  is_public: false,
};

/**
 * Staff-owned food/medication item library (sidebar page): each of the 7
 * Hotel/Daycare check-in roles keeps their own reusable food/medication
 * items, picked from a dropdown at check-in or staff-mode booking creation
 * instead of retyped every time (see StaffItemPicker). Items can be marked
 * public so other staff can pick them too, seeing the item's full details
 * and owner's name.
 *
 * Admin/Superadmin additionally see and may edit/archive every *public*
 * item here (not just their own), mirroring the fetch the pickers
 * themselves use (listPickable*) - everyone else sees only their own
 * (listMine*). This keeps every row shown always editable/archivable by
 * the current viewer, with no extra per-row permission check needed in the
 * UI.
 *
 * Notion-style browsing (search/sort/filter/group-by/view-switch) mirrors
 * CustomerFoodMedicationPage.tsx's own combined-list pattern; food and
 * medication stay two separate API calls/tables, merged client-side into
 * one StaffCatalogItem[] union just for this one browsable list.
 */
export function StaffFoodMedicationItemsPage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [isAdminViewer, setIsAdminViewer] = useState(false);

  const [items, setItems] = useState<StaffCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState(
    STAFF_ITEM_GROUP_BY_AXES[0].id
  );

  const [addStep, setAddStep] = useState<AddStep | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [foodForm, setFoodForm] = useState<FoodFormState>(EMPTY_FOOD_FORM);
  const [medicationForm, setMedicationForm] = useState<MedicationFormState>(
    EMPTY_MEDICATION_FORM
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!accessToken || !user?.id) return;
    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      const role = result.data?.role;
      setRoleStatus(role && ALLOWED_VIEWER_ROLES.has(role) ? 'ok' : 'denied');
      setIsAdminViewer(Boolean(role && ADMIN_ROLE_SET.has(role)));
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken) return;
    const token = accessToken;
    let isMounted = true;

    const loadFood = isAdminViewer
      ? listPickableFoodItems(token)
      : listMyFoodItems(token);
    const loadMedication = isAdminViewer
      ? listPickableMedicationItems(token)
      : listMyMedicationItems(token);

    void Promise.all([loadFood, loadMedication]).then(
      ([foodResult, medicationResult]) => {
        if (!isMounted) return;
        setIsLoading(false);

        if (foodResult.error || !foodResult.data) {
          setError(foodResult.error ?? 'Could not load your items.');
          return;
        }
        if (medicationResult.error || !medicationResult.data) {
          setError(medicationResult.error ?? 'Could not load your items.');
          return;
        }

        setItems([
          ...foodResult.data.map((item) => ({
            ...item,
            kind: 'food' as const,
          })),
          ...medicationResult.data.map((item) => ({
            ...item,
            kind: 'medication' as const,
          })),
        ]);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [roleStatus, isAdminViewer, accessToken]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? items.filter((item) => matchesStaffItemQuery(item, query))
      : items;
    const filtered = applyStaffItemFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(
      STAFF_ITEM_COMPARATORS[deriveStaffItemSortKey(sortTile)]
    );
  }, [items, search, filterTiles, sortTile]);

  const activeGroupAxis =
    STAFF_ITEM_GROUP_BY_AXES.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedItems = useGroupBy(
    visibleItems,
    view === 'board' ? activeGroupAxis : null
  );

  function handleAddFilter(fieldId: string) {
    const field = STAFF_ITEM_FILTER_FIELDS.find((f) => f.id === fieldId);
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

  function openAddChooser() {
    setEditingId(null);
    setFormError(null);
    setAddStep('choose');
  }

  function openCreateFood() {
    setEditingId(null);
    setFoodForm(EMPTY_FOOD_FORM);
    setFormError(null);
    setAddStep('food');
  }

  function openCreateMedication() {
    setEditingId(null);
    setMedicationForm(EMPTY_MEDICATION_FORM);
    setFormError(null);
    setAddStep('medication');
  }

  function openEditFood(item: StaffCatalogItem & { kind: 'food' }) {
    setEditingId(item.id);
    setFoodForm({
      name: item.name,
      quantity: item.quantity,
      quantity_unit: item.quantity_unit ?? '',
      special_instructions: item.special_instructions ?? '',
      is_public: item.is_public,
    });
    setFormError(null);
    setAddStep('food');
  }

  function openEditMedication(item: StaffCatalogItem & { kind: 'medication' }) {
    setEditingId(item.id);
    setMedicationForm({
      name: item.name,
      dose: item.dose,
      dose_unit: item.dose_unit ?? '',
      administration_notes: item.administration_notes ?? '',
      is_public: item.is_public,
    });
    setFormError(null);
    setAddStep('medication');
  }

  function closeForm() {
    setAddStep(null);
    setEditingId(null);
    setFormError(null);
  }

  async function handleToggleFoodPublic(
    item: StaffCatalogItem & { kind: 'food' },
    nextIsPublic: boolean
  ) {
    if (!accessToken) return;
    const result = await updateFoodItem(
      item.id,
      { is_public: nextIsPublic },
      accessToken
    );
    if (!result.data) {
      setError(result.error ?? 'Could not update this item.');
      return;
    }
    const saved = result.data;
    setItems((prev) =>
      prev.map((entry) =>
        entry.kind === 'food' && entry.id === saved.id
          ? { ...saved, kind: 'food' }
          : entry
      )
    );
  }

  async function handleToggleMedicationPublic(
    item: StaffCatalogItem & { kind: 'medication' },
    nextIsPublic: boolean
  ) {
    if (!accessToken) return;
    const result = await updateMedicationItem(
      item.id,
      { is_public: nextIsPublic },
      accessToken
    );
    if (!result.data) {
      setError(result.error ?? 'Could not update this item.');
      return;
    }
    const saved = result.data;
    setItems((prev) =>
      prev.map((entry) =>
        entry.kind === 'medication' && entry.id === saved.id
          ? { ...saved, kind: 'medication' }
          : entry
      )
    );
  }

  async function handleArchive(item: StaffCatalogItem) {
    if (!accessToken) return;
    setError(null);

    const result =
      item.kind === 'food'
        ? await archiveFoodItem(item.id, accessToken)
        : await archiveMedicationItem(item.id, accessToken);

    if (result.error) {
      setError(result.error);
      return;
    }

    setItems((prev) => prev.filter((entry) => entry.id !== item.id));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    if (addStep === 'food') {
      if (!foodForm.name.trim() || !foodForm.quantity.trim()) {
        setFormError('Name and quantity are required.');
        return;
      }

      setIsSubmitting(true);
      setFormError(null);

      const payload = {
        name: foodForm.name.trim(),
        quantity: foodForm.quantity.trim(),
        quantity_unit: foodForm.quantity_unit || undefined,
        special_instructions: foodForm.special_instructions.trim() || undefined,
        is_public: foodForm.is_public,
      };

      const result =
        editingId === null
          ? await createFoodItem(payload, accessToken)
          : await updateFoodItem(editingId, payload, accessToken);

      setIsSubmitting(false);

      if (!result.data) {
        setFormError(result.error ?? 'Could not save this food item.');
        return;
      }

      const saved = { ...result.data, kind: 'food' as const };
      setItems((prev) =>
        editingId === null
          ? [...prev, saved]
          : prev.map((entry) => (entry.id === saved.id ? saved : entry))
      );
      setMessage(
        editingId === null ? 'Food item added.' : 'Food item updated.'
      );
      closeForm();
      return;
    }

    if (addStep === 'medication') {
      if (!medicationForm.name.trim() || !medicationForm.dose.trim()) {
        setFormError('Name and dose are required.');
        return;
      }

      setIsSubmitting(true);
      setFormError(null);

      const payload = {
        name: medicationForm.name.trim(),
        dose: medicationForm.dose.trim(),
        dose_unit: medicationForm.dose_unit || undefined,
        administration_notes:
          medicationForm.administration_notes.trim() || undefined,
        is_public: medicationForm.is_public,
      };

      const result =
        editingId === null
          ? await createMedicationItem(payload, accessToken)
          : await updateMedicationItem(editingId, payload, accessToken);

      setIsSubmitting(false);

      if (!result.data) {
        setFormError(result.error ?? 'Could not save this medication item.');
        return;
      }

      const saved = { ...result.data, kind: 'medication' as const };
      setItems((prev) =>
        editingId === null
          ? [...prev, saved]
          : prev.map((entry) => (entry.id === saved.id ? saved : entry))
      );
      setMessage(
        editingId === null
          ? 'Medication item added.'
          : 'Medication item updated.'
      );
      closeForm();
    }
  }

  function buildActionItems(item: StaffCatalogItem): MoreOptionsMenuItem[] {
    return [
      {
        label: 'Edit',
        onSelect: () =>
          item.kind === 'food' ? openEditFood(item) : openEditMedication(item),
      },
      { label: 'Archive', onSelect: () => void handleArchive(item) },
    ];
  }

  function renderVisibilityToggle(item: StaffCatalogItem) {
    return (
      <ToggleSwitch
        checked={item.is_public}
        label={`Make ${item.name} public`}
        hideLabel
        onChange={(checked) =>
          void (item.kind === 'food'
            ? handleToggleFoodPublic(item, checked)
            : handleToggleMedicationPublic(item, checked))
        }
      />
    );
  }

  const columns: DataTableColumn<StaffCatalogItem>[] = [
    {
      id: 'name',
      header: 'Name',
      render: (item) => <span className={styles.itemName}>{item.name}</span>,
    },
    {
      id: 'category',
      header: 'Category',
      render: (item) => (item.kind === 'food' ? 'Food' : 'Medication'),
    },
    {
      id: 'visibility',
      header: 'Public',
      render: renderVisibilityToggle,
    },
  ];

  function renderItemRow(item: StaffCatalogItem) {
    return (
      <div className={styles.rowContent}>
        <span className={styles.itemName}>
          {item.name} ({item.kind === 'food' ? 'Food' : 'Medication'})
        </span>
        {renderVisibilityToggle(item)}
        <MoreOptionsMenu
          label={`Actions for ${item.name}`}
          items={buildActionItems(item)}
        />
      </div>
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your food/medication items.
        </p>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <LoadingState />
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/dashboard" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Food &amp; Medication Items</h1>
          <p className={styles.copy}>
            Save food and medication items you use often so you can pick them at
            check-in or when booking for a customer - mark an item public so
            other staff can use it too.
          </p>
        </div>
        <button
          type="button"
          className={styles.button}
          onClick={openAddChooser}
        >
          <Plus size={16} aria-hidden="true" />
          Add item
        </button>
      </div>

      {message ? <p className={styles.successBanner}>{message}</p> : null}
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <LoadingState />
      ) : (
        <section className={styles.panel}>
          <FilterSortBar
            filterFields={STAFF_ITEM_FILTER_FIELDS}
            filterTiles={filterTiles}
            onAddFilter={handleAddFilter}
            onChangeFilter={handleChangeFilter}
            onRemoveFilter={handleRemoveFilter}
            sortFields={STAFF_ITEM_SORT_FIELDS}
            sortTile={sortTile}
            onChangeSort={setSortTile}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search items..."
          >
            {view === 'board' ? (
              <select
                className={styles.select}
                aria-label="Group by"
                value={groupAxisId}
                onChange={(event) => setGroupAxisId(event.target.value)}
              >
                {STAFF_ITEM_GROUP_BY_AXES.map((axis) => (
                  <option key={axis.id} value={axis.id}>
                    Group by {axis.label}
                  </option>
                ))}
              </select>
            ) : null}
            <ViewSwitcher
              options={VIEW_OPTIONS}
              value={view}
              onChange={setView}
              ariaLabel="Food and medication items view"
            />
          </FilterSortBar>

          {view === 'table' ? (
            <DataTable
              columns={columns}
              rows={visibleItems}
              getRowKey={(item) => item.id}
              renderRowActions={(item) => (
                <MoreOptionsMenu
                  label={`Actions for ${item.name}`}
                  items={buildActionItems(item)}
                />
              )}
              emptyMessage="No items match this filter."
            />
          ) : view === 'list' ? (
            <DataList
              items={visibleItems}
              getRowKey={(item) => item.id}
              renderItem={renderItemRow}
              emptyMessage="No items match this filter."
            />
          ) : (
            <DataBoard
              groups={groupedItems}
              getRowKey={(item) => item.id}
              renderCard={(item) => (
                <div className={styles.item}>{renderItemRow(item)}</div>
              )}
              emptyColumnMessage="No items here."
            />
          )}
        </section>
      )}

      <Modal
        isOpen={addStep === 'choose'}
        title="What are you adding?"
        onClose={closeForm}
        closeOnBackdropClick={false}
      >
        <div className={styles.chooserActions}>
          <button
            type="button"
            className={styles.button}
            onClick={openCreateFood}
          >
            Food
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={openCreateMedication}
          >
            Medication
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={addStep === 'food'}
        title={editingId === null ? 'Add food item' : 'Edit food item'}
        onClose={closeForm}
        closeOnBackdropClick={false}
      >
        <form
          className={styles.form}
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              className={styles.input}
              value={foodForm.name}
              onChange={(event) =>
                setFoodForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
              autoFocus
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Quantity</span>
            <input
              className={styles.input}
              value={foodForm.quantity}
              onChange={(event) =>
                setFoodForm((prev) => ({
                  ...prev,
                  quantity: event.target.value,
                }))
              }
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Unit (optional)</span>
            <select
              className={styles.select}
              value={foodForm.quantity_unit}
              onChange={(event) =>
                setFoodForm((prev) => ({
                  ...prev,
                  quantity_unit: event.target.value as FoodQuantityUnit | '',
                }))
              }
            >
              <option value="">No unit</option>
              {FOOD_QUANTITY_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Special instructions (optional)
            </span>
            <input
              className={styles.input}
              value={foodForm.special_instructions}
              onChange={(event) =>
                setFoodForm((prev) => ({
                  ...prev,
                  special_instructions: event.target.value,
                }))
              }
            />
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={foodForm.is_public}
              onChange={(event) =>
                setFoodForm((prev) => ({
                  ...prev,
                  is_public: event.target.checked,
                }))
              }
            />
            Make this item public - other staff will see your name on it
          </label>

          {formError ? (
            <p className={styles.errorBanner} role="alert">
              {formError}
            </p>
          ) : null}

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={closeForm}
            >
              Cancel
            </button>
            <button
              className={styles.button}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={addStep === 'medication'}
        title={
          editingId === null ? 'Add medication item' : 'Edit medication item'
        }
        onClose={closeForm}
        closeOnBackdropClick={false}
      >
        <form
          className={styles.form}
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              className={styles.input}
              value={medicationForm.name}
              onChange={(event) =>
                setMedicationForm((prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }
              required
              autoFocus
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Dose</span>
            <input
              className={styles.input}
              value={medicationForm.dose}
              onChange={(event) =>
                setMedicationForm((prev) => ({
                  ...prev,
                  dose: event.target.value,
                }))
              }
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Unit (optional)</span>
            <select
              className={styles.select}
              value={medicationForm.dose_unit}
              onChange={(event) =>
                setMedicationForm((prev) => ({
                  ...prev,
                  dose_unit: event.target.value as MedicationDoseUnit | '',
                }))
              }
            >
              <option value="">No unit</option>
              {MEDICATION_DOSE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Administration notes (optional)
            </span>
            <input
              className={styles.input}
              value={medicationForm.administration_notes}
              onChange={(event) =>
                setMedicationForm((prev) => ({
                  ...prev,
                  administration_notes: event.target.value,
                }))
              }
            />
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={medicationForm.is_public}
              onChange={(event) =>
                setMedicationForm((prev) => ({
                  ...prev,
                  is_public: event.target.checked,
                }))
              }
            />
            Make this item public - other staff will see your name on it
          </label>

          {formError ? (
            <p className={styles.errorBanner} role="alert">
              {formError}
            </p>
          ) : null}

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={closeForm}
            >
              Cancel
            </button>
            <button
              className={styles.button}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
