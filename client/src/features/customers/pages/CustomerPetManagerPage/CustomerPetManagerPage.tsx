import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Columns3,
  List as ListIcon,
  Table as TableIcon,
  TriangleAlert,
} from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getPetBookingConflicts } from '../../../booking/api/booking.api';
import type { PetBookingConflict } from '../../../booking/booking.types';
import { BookingDetailsModal } from '../../../booking/components/BookingDetailsModal/BookingDetailsModal';
import {
  archivePet,
  deactivatePet,
  listCustomerPets,
} from '../../api/customer.api';
import { PetCard } from '../../components/cards/PetCard/PetCard';
import { PetForm } from '../../components/forms/PetForm/PetForm';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import { Modal } from '../../../../shared/components/Modal/Modal';
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
import { formatPetAge } from '../../../../shared/utils/formatPetAge';
import { formatRelativeTime } from '../../../../shared/utils/formatRelativeTime';
import type { Pet, PetDeleteReason } from '../../customer.types';
import {
  PET_DELETE_REASON_OTHER_MAX_LENGTH,
  PET_DELETE_REASONS,
} from './petDeleteReasons';
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
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { PetAvatar } from '../../../../shared/components/PetAvatar/PetAvatar';

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
  // Each pet's unresolved booking (one per pet, the earliest) - these pets
  // can't be deleted (same check the booking flow's Pet step uses to block
  // a double booking), and the Booking filter/column read it too.
  const [conflictByPetId, setConflictByPetId] = useState<
    Map<string, PetBookingConflict>
  >(() => new Map());
  const unresolvedPetIds = useMemo(
    () => new Set(conflictByPetId.keys()),
    [conflictByPetId]
  );
  // Booking opened from a pet's Booking cell - shows its full details.
  const [detailsBookingId, setDetailsBookingId] = useState<string | null>(
    null
  );
  const [petToDelete, setPetToDelete] = useState<Pet | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Why the customer is deleting - required before "Delete pet" enables.
  // Saved with the archive for a future Trends tab, not shown anywhere yet.
  const [deleteReason, setDeleteReason] = useState<PetDeleteReason | ''>('');
  const [deleteReasonOther, setDeleteReasonOther] = useState('');
  const isDeleteReasonMissing =
    deleteReason === '' ||
    (deleteReason === 'other' && deleteReasonOther.trim() === '');

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

    void getPetBookingConflicts(user.id, accessToken).then((result) => {
      if (isMounted && result.data) {
        setConflictByPetId(
          new Map(result.data.map((conflict) => [conflict.pet_id, conflict]))
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, accessToken]);

  const handlePetCreated = (pet: Pet, photoError?: string) => {
    setPets((prev) => [...prev, pet]);
    setShowPetForm(false);
    setPetMessage(
      photoError
        ? `Pet added, but the photo could not be uploaded: ${photoError}`
        : 'Pet added.'
    );
  };

  function handleDeleteClick(pet: Pet) {
    setPetMessage(null);

    if (conflictByPetId.has(pet.id)) {
      setDeleteError(
        `${pet.name} has a booking that isn't finished yet. Cancel or complete it before deleting this pet.`
      );
      return;
    }

    setDeleteError(null);
    setDeleteReason('');
    setDeleteReasonOther('');
    setPetToDelete(pet);
  }

  /** "Delete" archives the pet: it leaves the customer's list but its
   * booking and medical history stay, and staff can restore it. The server
   * only archives an inactive pet (petArchive.service.ts), so deactivate
   * goes first. */
  async function handleConfirmDelete() {
    if (
      !petToDelete ||
      !accessToken ||
      deleteReason === '' ||
      isDeleteReasonMissing
    ) {
      return;
    }

    setIsDeleting(true);
    const deactivated = await deactivatePet(petToDelete.id, accessToken);
    const archived = deactivated.error
      ? deactivated
      : await archivePet(petToDelete.id, accessToken, {
          reason: deleteReason,
          reasonOther:
            deleteReason === 'other' ? deleteReasonOther.trim() : null,
        });
    setIsDeleting(false);

    if (archived.error) {
      setDeleteError(archived.error);
      setPetToDelete(null);
      return;
    }

    setPets((prev) => prev.filter((pet) => pet.id !== petToDelete.id));
    setPetToDelete(null);
    setPetMessage('Pet deleted.');
  }

  const filterFields = useMemo(() => buildPetFilterFields(pets), [pets]);
  const groupByAxes = useMemo(() => buildPetGroupByAxes(pets), [pets]);

  const visiblePets = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? pets.filter((pet) => matchesPetQuery(pet, query))
      : pets;
    const filtered = applyPetFilters(searched, filterTiles, unresolvedPetIds);

    if (!sortTile) return filtered;
    return [...filtered].sort(PET_COMPARATORS[derivePetSortKey(sortTile)]);
  }, [pets, search, filterTiles, sortTile, unresolvedPetIds]);

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

  /** A pet's unresolved booking as a button that opens its full details,
   * or null when it has none. */
  function renderBookingLink(pet: Pet) {
    const conflict = conflictByPetId.get(pet.id);
    if (!conflict) return null;

    const when = new Date(conflict.scheduled_start).toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return (
      <button
        type="button"
        className={styles.bookingLink}
        aria-label={`View ${pet.name}'s ${conflict.service_category} booking on ${when}`}
        onClick={() => setDetailsBookingId(conflict.booking_id)}
      >
        {conflict.service_category} · {when}
      </button>
    );
  }

  const columns: DataTableColumn<Pet>[] = [
    {
      id: 'name',
      header: 'Name',
      render: (pet) => (
        <Link className={styles.petLink} to={`/portal/pets/${pet.id}`}>
          <PetAvatar name={pet.name} photoUrl={pet.photo_url} size="sm" />
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
      id: 'age',
      header: 'Age',
      render: (pet) => formatPetAge(pet.date_of_birth) ?? '—',
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
    {
      id: 'booking',
      header: 'Booking',
      render: (pet) => renderBookingLink(pet) ?? '—',
    },
  ];

  function renderPetRow(pet: Pet) {
    return (
      <div className={styles.listRow}>
        <Link className={styles.petLink} to={`/portal/pets/${pet.id}`}>
          <PetAvatar name={pet.name} photoUrl={pet.photo_url} size="sm" />
          {pet.name}
        </Link>
        <span className={styles.petTypeBadge}>{pet.pet_type}</span>
        {formatPetAge(pet.date_of_birth) ? (
          <span className={styles.copy}>{formatPetAge(pet.date_of_birth)}</span>
        ) : null}
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
        {renderBookingLink(pet)}
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
      <header className={styles.header}>
        <h1 className={styles.title}>Pet Manager</h1>
        <button
          className={styles.button}
          type="button"
          onClick={() => setShowPetForm(true)}
        >
          Add a pet
        </button>
      </header>

      <section className={styles.panel}>
        {petMessage ? (
          <p className={styles.successBanner}>{petMessage}</p>
        ) : null}
        {deleteError ? (
          <p className={styles.errorBanner} role="alert">
            {deleteError}
          </p>
        ) : null}

        {isLoading ? (
          <LoadingState label="Loading your pets..." />
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
                renderRowActions={(pet) => (
                  <button
                    type="button"
                    className={styles.deleteButton}
                    aria-label={`Delete ${pet.name}`}
                    title={`Delete ${pet.name}`}
                    onClick={() => handleDeleteClick(pet)}
                  >
                    Delete
                  </button>
                )}
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
      </section>

      {/* Opens over the pet list instead of pushing it down. An outside
          click doesn't close it, so half-typed pet details aren't lost - the
          × (or Cancel) does. */}
      <Modal
        isOpen={showPetForm}
        title="Add a pet"
        onClose={() => setShowPetForm(false)}
        closeOnBackdropClick={false}
      >
        <PetForm
          customerId={user.id}
          accessToken={accessToken}
          onCreated={handlePetCreated}
        />
        <button
          className={styles.cancelButton}
          type="button"
          onClick={() => setShowPetForm(false)}
        >
          Cancel
        </button>
      </Modal>

      <BookingDetailsModal
        bookingId={detailsBookingId}
        onClose={() => setDetailsBookingId(null)}
      />

      <ConfirmDialog
        isOpen={petToDelete !== null}
        title={`Delete ${petToDelete?.name ?? 'pet'}?`}
        body={
          <>
            <p className={styles.deleteWarning}>
              <TriangleAlert
                className={styles.deleteWarningIcon}
                aria-hidden="true"
              />
              <span>
                <strong>Warning:</strong> {petToDelete?.name} will be removed
                from your pets. You won&apos;t be able to book services for{' '}
                {petToDelete?.name} unless the clinic restores it.
              </span>
            </p>
            <fieldset className={styles.reasonGroup} disabled={isDeleting}>
              <legend className={styles.reasonLegend}>
                Why are you deleting {petToDelete?.name}?
              </legend>
              {PET_DELETE_REASONS.map((option) => (
                <label key={option.value} className={styles.reasonOption}>
                  <input
                    type="radio"
                    name="pet-delete-reason"
                    value={option.value}
                    checked={deleteReason === option.value}
                    onChange={() => setDeleteReason(option.value)}
                  />
                  {option.label}
                </label>
              ))}
              {deleteReason === 'other' ? (
                <label className={styles.reasonOther}>
                  <span className={styles.filterLabel}>Tell us more</span>
                  <textarea
                    className={styles.reasonTextarea}
                    value={deleteReasonOther}
                    onChange={(event) =>
                      setDeleteReasonOther(event.target.value)
                    }
                    maxLength={PET_DELETE_REASON_OTHER_MAX_LENGTH}
                    rows={3}
                    autoFocus
                  />
                </label>
              ) : null}
            </fieldset>
          </>
        }
        confirmLabel="Delete pet"
        tone="danger"
        isConfirming={isDeleting}
        confirmDisabled={isDeleteReasonMissing}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setPetToDelete(null)}
      />
    </main>
  );
}
