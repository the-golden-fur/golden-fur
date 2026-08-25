import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import {
  getCustomerProfile,
  getPet,
} from '../../../customers/api/customer.api';
import type {
  CustomerProfile,
  Pet,
  PetType,
} from '../../../customers/customer.types';
import {
  SearchSortBar,
  type SortOption,
} from '../../../../shared/components/SearchSortBar/SearchSortBar';
import { MoreOptionsMenu } from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { useSearchAndSort } from '../../../../shared/hooks/useSearchAndSort/useSearchAndSort';
import {
  getPetConsultationHistory,
  listMyPatients,
} from '../../api/veterinary.api';
import type { Consultation } from '../../veterinary.types';
import { PetHistoryTab } from '../../components/PetHistoryTab/PetHistoryTab';
import styles from './MyPatientsPage.module.css';

/** "My Patients" is a personal roster, unlike the Consultation Queue (which
 * Admin/Supervisor/Superadmin can also view) - only the Veterinarian who
 * owns the data can see it, matching the server's own requester-scoped
 * query (listVeterinarianPatients always filters by the caller's id). */
const ALLOWED_VIEWER_ROLES = new Set(['Veterinarian']);

type SortKey = 'recent' | 'pet-name';
const SORT_OPTIONS: SortOption<SortKey>[] = [
  { value: 'recent', label: 'Sort: Most recent visit' },
  { value: 'pet-name', label: 'Sort: Pet name (A-Z)' },
];

const PET_TYPES: PetType[] = ['Dog', 'Cat'];
type PetTypeFilter = PetType | 'All';

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
  const [petTypeFilter, setPetTypeFilter] = useState<PetTypeFilter>('All');

  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [petHistory, setPetHistory] = useState<Consultation[]>([]);
  const [isPetHistoryLoading, setIsPetHistoryLoading] = useState(false);
  const [petHistoryError, setPetHistoryError] = useState<string | null>(null);

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

  type PatientRow = (typeof rows)[number];

  const {
    search,
    setSearch,
    sortKey,
    setSortKey,
    result: searchedRows,
  } = useSearchAndSort<PatientRow, SortKey>({
    items: rows,
    matchesQuery: (row, query) =>
      row.petName.toLowerCase().includes(query) ||
      row.ownerName.toLowerCase().includes(query),
    comparators: {
      recent: (a, b) =>
        new Date(b.lastVisitAt).getTime() - new Date(a.lastVisitAt).getTime(),
      'pet-name': (a, b) => a.petName.localeCompare(b.petName),
    },
    initialSortKey: 'recent',
  });

  const visibleRows = useMemo(() => {
    if (petTypeFilter === 'All') return searchedRows;
    return searchedRows.filter((row) => row.petType === petTypeFilter);
  }, [searchedRows, petTypeFilter]);

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
        <h1 className={styles.title}>My Patients</h1>

        <div className={styles.toolbar}>
          <div className={styles.filters}>
            <SearchSortBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search by pet or owner..."
              sortValue={sortKey}
              onSortChange={setSortKey}
              sortOptions={SORT_OPTIONS}
            />

            <label className={styles.filterField}>
              <span className={styles.filterLabel}>Pet Type</span>
              <select
                className={styles.filterSelect}
                value={petTypeFilter}
                onChange={(event) =>
                  setPetTypeFilter(event.target.value as PetTypeFilter)
                }
              >
                <option value="All">All types</option>
                {PET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
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
              {visibleRows.length === 0 ? (
                <p className={styles.copy}>
                  No patients match these filters. Patients appear here after
                  you complete a consultation for them.
                </p>
              ) : (
                <ul className={styles.rowList}>
                  {visibleRows.map((row) => (
                    <li key={row.petId} className={styles.rowItem}>
                      <div
                        className={
                          row.petId === selectedPetId
                            ? styles.cardActive
                            : styles.card
                        }
                      >
                        <span className={styles.rowPetName}>{row.petName}</span>
                        <span className={styles.rowMeta}>{row.ownerName}</span>
                        <span className={styles.rowMeta}>
                          Last visit: {formatDate(row.lastVisitAt)}
                        </span>
                      </div>
                      <MoreOptionsMenu
                        label={`More options for ${row.petName}`}
                        items={[
                          {
                            label: 'View History',
                            onSelect: () => selectPatient(row.petId),
                          },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.detail}>
              {selectedRow ? (
                <div className={styles.panel}>
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
                  Use the ⋮ menu on a patient to view their history.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
