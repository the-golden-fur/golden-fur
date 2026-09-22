import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import {
  getCustomerProfile,
  getPet,
  listPetTypes,
} from '../../../customers/api/customer.api';
import type {
  CustomerProfile,
  Pet,
  PetTypeRow,
} from '../../../customers/customer.types';
import { DataList } from '../../../../shared/components/DataList/DataList';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type {
  FilterTile,
  FilterValue,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import { CardContextMenu } from '../../../../shared/components/MoreOptionsMenu/CardContextMenu';
import type { MoreOptionsMenuItem } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import {
  getPetConsultationHistory,
  listMyPatients,
} from '../../api/veterinary.api';
import type { Consultation } from '../../veterinary.types';
import { PetHistoryTab } from '../../components/PetHistoryTab/PetHistoryTab';
import {
  applyPatientFilters,
  buildPatientFilterFields,
  derivePatientSortKey,
  matchesPatientQuery,
  PATIENT_COMPARATORS,
  PATIENT_SORT_FIELDS,
} from './myPatientsBrowserFields';
import styles from './MyPatientsPage.module.css';

/** "My Patients" is a personal roster, unlike the Consultation Queue (which
 * Admin/Supervisor/Superadmin can also view) - only the Veterinarian who
 * owns the data can see it, matching the server's own requester-scoped
 * query (listVeterinarianPatients always filters by the caller's id). */
const ALLOWED_VIEWER_ROLES = new Set(['Veterinarian']);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function MyPatientsPage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );

  const [patients, setPatients] = useState<
    { petId: string; lastVisitAt: string }[]
  >([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [petTypeOptions, setPetTypeOptions] = useState<PetTypeRow[]>([]);

  const [search, setSearch] = useState('');
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  // Matches this page's old useSearchAndSort default - patients have always
  // opened sorted by most recent visit, not in raw fetch order.
  const [sortTile, setSortTile] = useState<SortTile | null>({
    fieldId: 'recent',
    direction: 'desc',
  });

  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [petHistory, setPetHistory] = useState<Consultation[]>([]);
  const [isPetHistoryLoading, setIsPetHistoryLoading] = useState(false);
  const [petHistoryError, setPetHistoryError] = useState<string | null>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  // Closes the pet history panel on an outside click or Escape, mirroring
  // MoreOptionsMenu's own dismiss pattern - otherwise the only way back to
  // the "Use the menu on a patient..." placeholder is selecting another
  // patient.
  useEffect(() => {
    if (!selectedPetId) return;

    function handlePointerDown(event: MouseEvent) {
      if (!detailPanelRef.current?.contains(event.target as Node)) {
        setSelectedPetId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedPetId(null);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedPetId]);

  // Pet Types admin CRUD (20260912191): the filter dropdown reads the
  // admin-managed list instead of a hardcoded ['Dog', 'Cat'] array.
  useEffect(() => {
    let isMounted = true;

    void listPetTypes().then((result) => {
      if (isMounted) {
        setPetTypeOptions(result.data ?? []);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      setRoleStatus(
        result.data && ALLOWED_VIEWER_ROLES.has(result.data.role)
          ? 'ok'
          : 'denied'
      );
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken) return;

    const token = accessToken;
    let isMounted = true;

    void listMyPatients(token).then((result) => {
      if (!isMounted) return;

      if (result.error || !result.data) {
        setIsLoading(false);
        setLoadError(result.error ?? 'Could not load your patients.');
        return;
      }

      setLoadError(null);
      setPatients(
        result.data.map((row) => ({
          petId: row.pet_id,
          lastVisitAt: row.last_visit_at,
        }))
      );
      setIsLoading(false);

      void Promise.all(
        result.data.map((row) => getPet(row.pet_id, token))
      ).then((petResults) => {
        if (!isMounted) return;

        const nextPets: Record<string, Pet> = {};
        for (const petResult of petResults) {
          if (petResult.data) nextPets[petResult.data.id] = petResult.data;
        }
        setPets(nextPets);

        const customerIds = new Set(
          Object.values(nextPets).map((pet) => pet.customer_id)
        );

        void Promise.all(
          Array.from(customerIds).map((id) => getCustomerProfile(id, token))
        ).then((ownerResults) => {
          if (!isMounted) return;

          const nextOwners: Record<string, CustomerProfile> = {};
          for (const ownerResult of ownerResults) {
            if (ownerResult.data)
              nextOwners[ownerResult.data.id] = ownerResult.data;
          }
          setOwners(nextOwners);
        });
      });
    });

    return () => {
      isMounted = false;
    };
  }, [roleStatus, accessToken]);

  const rows = useMemo(() => {
    return patients.map((patient) => {
      const pet = pets[patient.petId];
      const owner = pet ? owners[pet.customer_id] : undefined;

      return {
        petId: patient.petId,
        lastVisitAt: patient.lastVisitAt,
        petName: pet?.name ?? 'Unknown pet',
        ownerName: owner?.full_name ?? 'Unknown owner',
        petType: pet?.pet_type ?? null,
      };
    });
  }, [patients, pets, owners]);

  const patientFilterFields = useMemo(
    () => buildPatientFilterFields(petTypeOptions),
    [petTypeOptions]
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searched = query
      ? rows.filter((row) => matchesPatientQuery(row, query))
      : rows;
    const filtered = applyPatientFilters(searched, filterTiles);

    if (!sortTile) return filtered;
    return [...filtered].sort(
      PATIENT_COMPARATORS[derivePatientSortKey(sortTile)]
    );
  }, [rows, search, filterTiles, sortTile]);

  function handleAddFilter(fieldId: string) {
    const field = patientFilterFields.find((f) => f.id === fieldId);
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

  function buildPatientActionItems(row: {
    petId: string;
  }): MoreOptionsMenuItem[] {
    return [
      { label: 'View History', onSelect: () => selectPatient(row.petId) },
    ];
  }

  const selectedRow = rows.find((row) => row.petId === selectedPetId);

  function selectPatient(petId: string) {
    setSelectedPetId(petId);
    setPetHistory([]);
    setPetHistoryError(null);
    setIsPetHistoryLoading(true);

    if (!accessToken) return;

    void getPetConsultationHistory(petId, accessToken).then((result) => {
      setIsPetHistoryLoading(false);

      if (result.error || !result.data) {
        setPetHistoryError(result.error ?? 'Could not load pet history.');
        return;
      }

      setPetHistory(result.data);
    });
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load your patients.
          </p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.pageHeader}>
          <h1 className={styles.title}>My Patients</h1>

          <div className={styles.toolbar}>
            <FilterSortBar
              filterFields={patientFilterFields}
              filterTiles={filterTiles}
              onAddFilter={handleAddFilter}
              onChangeFilter={handleChangeFilter}
              onRemoveFilter={handleRemoveFilter}
              sortFields={PATIENT_SORT_FIELDS}
              sortTile={sortTile}
              onChangeSort={setSortTile}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search by pet or owner..."
            />
          </div>
        </div>

        {isLoading ? (
          <p className={styles.copy}>Loading patients...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <div className={styles.layout}>
            <div className={styles.queue}>
              <DataList
                items={visibleRows}
                getRowKey={(row) => row.petId}
                emptyMessage="No patients match these filters. Patients appear here after you complete a consultation for them."
                renderItem={(row) => (
                  <CardContextMenu
                    label={`Actions for ${row.petName}`}
                    items={buildPatientActionItems(row)}
                  >
                    <div className={styles.rowContent}>
                      <div
                        className={
                          row.petId === selectedPetId
                            ? styles.cardActive
                            : styles.card
                        }
                      >
                        <span className={styles.rowPetName}>
                          {row.petName}
                        </span>
                        <span className={styles.rowMeta}>
                          {row.ownerName}
                        </span>
                        <span className={styles.rowMeta}>
                          Last visit: {formatDate(row.lastVisitAt)}
                        </span>
                      </div>
                    </div>
                  </CardContextMenu>
                )}
              />
            </div>

            <div className={styles.detail}>
              {selectedRow ? (
                <div className={styles.panel} ref={detailPanelRef}>
                  <div className={styles.header}>
                    <h2 className={styles.petName}>{selectedRow.petName}</h2>
                    <span className={styles.subtitle}>
                      Owner: {selectedRow.ownerName}
                    </span>
                  </div>
                  <PetHistoryTab
                    consultations={petHistory}
                    isLoading={isPetHistoryLoading}
                    error={petHistoryError}
                  />
                </div>
              ) : (
                <p className={styles.copy}>
                  Right-click (or press and hold) a patient to view their
                  history.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
