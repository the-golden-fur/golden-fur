import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Archive,
  Columns3,
  List as ListIcon,
  RotateCcw,
  Table as TableIcon,
} from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getPetBookingConflicts } from '../../../booking/api/booking.api';
import type { PetBookingConflict } from '../../../booking/booking.types';
import { BookingDetailsModal } from '../../../booking/components/BookingDetailsModal/BookingDetailsModal';
import {
  archivePet,
  deactivatePet,
  listArchivedPets,
  listCustomerPets,
  restorePet,
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
  // can't be archived (same check the booking flow's Pet step uses to block
  // a double booking), and the Booking filter/column read it too.
  const [conflictByPetId, setConflictByPetId] = useState<
    Map<string, PetBookingConflict>
  >(() => new Map());
  const unresolvedPetIds = useMemo(
    () => new Set(conflictByPetId.keys()),
    [conflictByPetId]
  );
  // Booking opened from a pet's Booking cell - shows its full details.
  const [detailsBookingId, setDetailsBookingId] = useState<string | null>(null);
  const [petToArchive, setPetToArchive] = useState<Pet | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  // Archived pets - listed (collapsed) under the roster, each restorable by
  // the customer themselves.
  const [archivedPets, setArchivedPets] = useState<Pet[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  // Why the customer is archiving - required before "Archive pet" enables.
  // Saved with the archive for a future Trends tab, not shown anywhere yet.
  const [archiveReason, setArchiveReason] = useState<PetDeleteReason | ''>('');
  const [archiveReasonOther, setArchiveReasonOther] = useState('');
  const isArchiveReasonMissing =
    archiveReason === '' ||
    (archiveReason === 'other' && archiveReasonOther.trim() === '');

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

    void listArchivedPets(accessToken, user.id)
      .then((result) => {
        if (isMounted && result.data) {
          setArchivedPets(result.data);
        }
      })
      .catch(() => {
        // Non-fatal: the roster still works; the Archived pets section just
        // stays hidden.
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

  function handleArchiveClick(pet: Pet) {
    setPetMessage(null);

    if (conflictByPetId.has(pet.id)) {
      setArchiveError(
        `${pet.name} has a booking that isn't finished yet. Cancel or complete it before archiving this pet.`
      );
      return;
    }

    setArchiveError(null);
    setArchiveReason('');
    setArchiveReasonOther('');
    setPetToArchive(pet);
  }

  /** Archiving moves the pet off the roster into "Archived pets" - its
   * booking and medical history stay, and the customer (or staff) can
   * restore it. The server only archives an inactive pet
   * (petArchive.service.ts), so deactivate goes first. */
  async function handleConfirmArchive() {
    if (
      !petToArchive ||
      !accessToken ||
      archiveReason === '' ||
      isArchiveReasonMissing
    ) {
      return;
    }

    setIsArchiving(true);
    const deactivated = await deactivatePet(petToArchive.id, accessToken);
    const archived = deactivated.error
      ? deactivated
      : await archivePet(petToArchive.id, accessToken, {
          reason: archiveReason,
          reasonOther:
            archiveReason === 'other' ? archiveReasonOther.trim() : null,
        });
    setIsArchiving(false);

    if (archived.error) {
      setArchiveError(archived.error);
      setPetToArchive(null);
      return;
    }

    const archivedPet: Pet = {
      ...petToArchive,
      is_active: false,
      archived_at: new Date().toISOString(),
      archive_reason: archiveReason,
      archive_reason_other:
        archiveReason === 'other' ? archiveReasonOther.trim() : null,
    };
    setPets((prev) => prev.filter((pet) => pet.id !== petToArchive.id));
    setArchivedPets((prev) => [archivedPet, ...prev]);
    setPetToArchive(null);
    setPetMessage(
      `${petToArchive.name} archived. You can restore it from Archived pets below.`
    );
  }

  /** Brings an archived pet back onto the roster - the server reactivates
   * it too, so it can be booked again. */
  async function handleRestore(pet: Pet) {
    if (!accessToken) return;

    setRestoringId(pet.id);
    setArchiveError(null);
    const result = await restorePet(pet.id, accessToken);
    setRestoringId(null);

    if (result.error) {
      setArchiveError(result.error);
      return;
    }

    setArchivedPets((prev) => prev.filter((item) => item.id !== pet.id));
    setPets((prev) => [
      ...prev,
      {
        ...pet,
        is_active: true,
        archived_at: null,
        archive_reason: null,
        archive_reason_other: null,
      },
    ]);
    setPetMessage(`${pet.name} restored.`);
  }

  function archiveReasonLabel(pet: Pet): string | null {
    if (!pet.archive_reason) return null;
    if (pet.archive_reason === 'other') {
      return pet.archive_reason_other ?? 'Other';
    }
    return (
      PET_DELETE_REASONS.find((option) => option.value === pet.archive_reason)
        ?.label ?? null
    );
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
        {archiveError ? (
          <p className={styles.errorBanner} role="alert">
            {archiveError}
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
                    className={styles.archiveButton}
                    aria-label={`Archive ${pet.name}`}
                    title={`Archive ${pet.name}`}
                    onClick={() => handleArchiveClick(pet)}
                  >
                    Archive
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

      {archivedPets.length > 0 ? (
        <section className={styles.archivedSection}>
          <button
            type="button"
            className={styles.archivedToggle}
            aria-expanded={showArchived}
            aria-controls="archived-pets-list"
            onClick={() => setShowArchived((open) => !open)}
          >
            <Archive aria-hidden="true" size={16} />
            Archived pets ({archivedPets.length})
          </button>
          {showArchived ? (
            <ul className={styles.archivedList} id="archived-pets-list">
              {archivedPets.map((pet) => {
                const reason = archiveReasonLabel(pet);
                return (
                  <li key={pet.id} className={styles.archivedRow}>
                    <PetAvatar
                      name={pet.name}
                      photoUrl={pet.photo_url}
                      size="sm"
                    />
                    <div className={styles.archivedInfo}>
                      <span className={styles.archivedName}>{pet.name}</span>
                      <span className={styles.copy}>
                        {pet.pet_type}
                        {pet.archived_at
                          ? ` · Archived ${formatRelativeTime(pet.archived_at)}`
                          : ''}
                        {reason ? ` · ${reason}` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.restoreButton}
                      aria-label={`Restore ${pet.name}`}
                      disabled={restoringId === pet.id}
                      onClick={() => void handleRestore(pet)}
                    >
                      <RotateCcw aria-hidden="true" size={14} />
                      {restoringId === pet.id ? 'Restoring...' : 'Restore'}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

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
        isOpen={petToArchive !== null}
        title={`Archive ${petToArchive?.name ?? 'pet'}?`}
        body={
          <>
            <p className={styles.archiveNotice}>
              <Archive
                className={styles.archiveNoticeIcon}
                aria-hidden="true"
              />
              <span>
                {petToArchive?.name} will move to <strong>Archived pets</strong>
                . You won&apos;t be able to book services for{' '}
                {petToArchive?.name} until you restore it.
              </span>
            </p>
            <fieldset className={styles.reasonGroup} disabled={isArchiving}>
              <legend className={styles.reasonLegend}>
                Why are you archiving {petToArchive?.name}?
              </legend>
              {PET_DELETE_REASONS.map((option) => (
                <label key={option.value} className={styles.reasonOption}>
                  <input
                    type="radio"
                    name="pet-archive-reason"
                    value={option.value}
                    checked={archiveReason === option.value}
                    onChange={() => setArchiveReason(option.value)}
                  />
                  {option.label}
                </label>
              ))}
              {archiveReason === 'other' ? (
                <label className={styles.reasonOther}>
                  <span className={styles.filterLabel}>Tell us more</span>
                  <textarea
                    className={styles.reasonTextarea}
                    value={archiveReasonOther}
                    onChange={(event) =>
                      setArchiveReasonOther(event.target.value)
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
        confirmLabel="Archive pet"
        isConfirming={isArchiving}
        confirmDisabled={isArchiveReasonMissing}
        onConfirm={() => void handleConfirmArchive()}
        onCancel={() => setPetToArchive(null)}
      />
    </main>
  );
}
