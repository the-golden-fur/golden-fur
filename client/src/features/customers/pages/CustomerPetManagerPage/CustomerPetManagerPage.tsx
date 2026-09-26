import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Columns3, List as ListIcon, Table as TableIcon } from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listCustomerPets } from '../../api/customer.api';
import { PetCard } from '../../components/cards/PetCard/PetCard';
import { PetForm } from '../../components/forms/PetForm/PetForm';
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
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { formatRelativeTime } from '../../../../shared/utils/formatRelativeTime';
import type { Pet } from '../../customer.types';
import {
  applyPetFilters,
  buildPetFilterFields,
  buildPetGroupByAxes,
  derivePetSortKey,
  matchesPetQuery,
  PET_COMPARATORS,
  PET_SORT_FIELDS,
} from './petBrowserFields';
import styles from './CustomerPetManagerPage.module.css';

type ViewMode = 'table' | 'list' | 'board';

const VIEW_OPTIONS: ViewSwitcherOption<ViewMode>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

/**
 * Pet Manager (`/portal/pets`) - extracted from the old CustomerProfilePage's
 * "My Pets" section, which no longer exists (its non-pet fields moved to
 * Settings > Profile). A customer's pet roster isn't profile data, so it
 * gets its own page rather than living inside Settings.
 */
export function CustomerPetManagerPage() {
  const { user, accessToken } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPetForm, setShowPetForm] = useState(false);
  const [petMessage, setPetMessage] = useState<string | null>(null);

  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [groupAxisId, setGroupAxisId] = useState('petType');

  useEffect(() => {
    if (!user?.id || !accessToken) {
      return;
    }

    let isMounted = true;

    void listCustomerPets(user.id, accessToken).then((result) => {
      if (isMounted) {
        setIsLoading(false);
        if (result.data) {
          setPets(result.data);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, accessToken]);

  const handlePetCreated = (pet: Pet) => {
    setPets((prev) => [...prev, pet]);
    setShowPetForm(false);
    setPetMessage('Pet added.');
  };

  const filterFields = useMemo(() => buildPetFilterFields(pets), [pets]);
  const groupByAxes = useMemo(() => buildPetGroupByAxes(pets), [pets]);

  const visiblePets = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? pets.filter((pet) => matchesPetQuery(pet, query))
      : pets;
    const filtered = applyPetFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(PET_COMPARATORS[derivePetSortKey(sortTile)]);
  }, [pets, search, filterTiles, sortTile]);

  const activeGroupAxis =
    groupByAxes.find((axis) => axis.id === groupAxisId) ?? null;
  const groupedPets = useGroupBy(
    visiblePets,
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

  const columns: DataTableColumn<Pet>[] = [
    {
      id: 'name',
      header: 'Name',
      render: (pet) => (
        <Link className={styles.petLink} to={`/portal/pets/${pet.id}`}>
          {pet.name}
        </Link>
      ),
    },
    {
      id: 'petType',
      header: 'Pet type',
      render: (pet) => (
        <span className={styles.petTypeBadge}>{pet.pet_type}</span>
      ),
    },
    {
      id: 'assessment',
      header: 'Weight / Coat',
      render: (pet) =>
        pet.weight_class && pet.coat_type ? (
          <span className={styles.assessmentBadge}>
            {pet.weight_class} · {pet.coat_type}
          </span>
        ) : (
          <span className={styles.assessmentBadge}>Not yet assessed</span>
        ),
    },
    {
      id: 'assessedAt',
      header: 'Last assessed',
      render: (pet) =>
        pet.assessed_at ? formatRelativeTime(pet.assessed_at) : '—',
    },
  ];

  function renderPetRow(pet: Pet) {
    return (
      <div className={styles.listRow}>
        <Link className={styles.petLink} to={`/portal/pets/${pet.id}`}>
          {pet.name}
        </Link>
        <span className={styles.petTypeBadge}>{pet.pet_type}</span>
        {pet.weight_class && pet.coat_type ? (
          <span className={styles.assessmentBadge}>
            {pet.weight_class} · {pet.coat_type}
          </span>
        ) : (
          <span className={styles.assessmentBadge}>Not yet assessed</span>
        )}
        {pet.assessed_at ? (
          <span className={styles.copy}>
            Last assessed {formatRelativeTime(pet.assessed_at)}
          </span>
        ) : null}
      </div>
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your pets.
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Pet Manager</h1>

      <section className={styles.panel}>
        {petMessage ? (
          <p className={styles.successBanner}>{petMessage}</p>
        ) : null}

        {isLoading ? (
          <p className={styles.copy}>Loading your pets...</p>
        ) : pets.length === 0 ? (
          <p className={styles.copy}>You haven&apos;t added any pets yet.</p>
        ) : (
          <>
            <FilterSortBar
              filterFields={filterFields}
              filterTiles={filterTiles}
              onAddFilter={handleAddFilter}
              onChangeFilter={handleChangeFilter}
              onRemoveFilter={handleRemoveFilter}
              sortFields={PET_SORT_FIELDS}
              sortTile={sortTile}
              onChangeSort={setSortTile}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search your pets..."
            >
              <div className={styles.viewControls}>
                <ViewSwitcher
                  options={VIEW_OPTIONS}
                  value={view}
                  onChange={setView}
                  ariaLabel="Pets view"
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
                rows={visiblePets}
                getRowKey={(pet) => pet.id}
                emptyMessage="No pets match this filter."
              />
            ) : view === 'list' ? (
              <DataList
                items={visiblePets}
                getRowKey={(pet) => pet.id}
                renderItem={renderPetRow}
                emptyMessage="No pets match this filter."
              />
            ) : (
              <DataBoard
                groups={groupedPets}
                getRowKey={(pet) => pet.id}
                renderCard={(pet) => <PetCard pet={pet} />}
                emptyColumnMessage="No pets here."
              />
            )}
          </>
        )}

        <button
          className={styles.button}
          type="button"
          onClick={() => setShowPetForm((current) => !current)}
        >
          {showPetForm ? 'Cancel' : 'Add a pet'}
        </button>

        {showPetForm ? (
          <PetForm
            customerId={user.id}
            accessToken={accessToken}
            onCreated={handlePetCreated}
          />
        ) : null}
      </section>
    </main>
  );
}
