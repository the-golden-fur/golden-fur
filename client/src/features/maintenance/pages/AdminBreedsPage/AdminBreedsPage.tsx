import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createBreedAdmin,
  deleteBreedAdmin,
  listBreedsAdmin,
  updateBreedAdmin,
} from '../../api/maintenance.api';
import type { Breed, PetType } from '../../maintenance.types';
import styles from './AdminBreedsPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side - this page is a write
 * surface, so the UI guard matches the API/RLS boundary by construction. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

const PET_TYPES: PetType[] = ['Dog', 'Cat'];

/**
 * Epic A follow-up: breeds previously had no CRUD anywhere - only the
 * seeded list from migration 20260725041. Lets Admin/Superadmin add, rename,
 * and remove breeds so BreedSelect's list doesn't require a new migration
 * every time it needs to grow.
 */
export function AdminBreedsPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newPetType, setNewPetType] = useState<PetType>('Dog');
  const [newName, setNewName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) {
      return;
    }

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) {
      return;
    }

    let isMounted = true;

    void listBreedsAdmin(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load breeds.');
        return;
      }

      setBreeds(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const breedsByType = useMemo(() => {
    const grouped = new Map<PetType, Breed[]>(PET_TYPES.map((t) => [t, []]));
    for (const breed of breeds) {
      grouped.get(breed.pet_type)?.push(breed);
    }
    return grouped;
  }, [breeds]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !newName.trim()) {
      setFormError('Name is required.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const result = await createBreedAdmin(accessToken, {
      pet_type: newPetType,
      name: newName.trim(),
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not add breed.');
      return;
    }

    setBreeds((prev) => [...prev, result.data as Breed]);
    setNewName('');
    setMessage('Breed added.');
  }

  function startEditing(breed: Breed) {
    setEditingId(breed.id);
    setEditingName(breed.name);
    setRowError(null);
  }

  async function handleRename(breedId: string) {
    if (!accessToken || !editingName.trim()) {
      setRowError('Name is required.');
      return;
    }

    setRowError(null);

    const result = await updateBreedAdmin(breedId, accessToken, {
      name: editingName.trim(),
    });

    if (result.error || !result.data) {
      setRowError(result.error ?? 'Could not rename breed.');
      return;
    }

    setBreeds((prev) =>
      prev.map((breed) =>
        breed.id === breedId ? (result.data as Breed) : breed
      )
    );
    setEditingId(null);
    setMessage('Breed renamed.');
  }

  async function handleDelete(breedId: string) {
    if (!accessToken) {
      return;
    }

    setRowError(null);

    const result = await deleteBreedAdmin(breedId, accessToken);

    if (result.error) {
      setRowError(result.error);
      return;
    }

    setBreeds((prev) => prev.filter((breed) => breed.id !== breedId));
    setMessage('Breed deleted.');
  }

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading...</p>
      </main>
    );
  }

  if (!isAllowedViewer) {
    return <Navigate to="/staff/profile" replace />;
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Breed Management</h1>

      {message ? <p className={styles.successBanner}>{message}</p> : null}

      <section className={styles.panel} aria-labelledby="add-breed-title">
        <h2 className={styles.sectionTitle} id="add-breed-title">
          Add breed
        </h2>
        <form
          className={styles.form}
          onSubmit={(event) => void handleCreate(event)}
        >
          <label className={styles.field}>
            <span className={styles.label}>Pet Type</span>
            <select
              className={styles.input}
              value={newPetType}
              onChange={(event) => setNewPetType(event.target.value as PetType)}
            >
              {PET_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <input
              className={styles.input}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
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
            {isSubmitting ? 'Adding...' : 'Add breed'}
          </button>
        </form>
      </section>

      {isLoading ? (
        <p className={styles.copy}>Loading breeds...</p>
      ) : loadError ? (
        <p className={styles.errorBanner} role="alert">
          {loadError}
        </p>
      ) : (
        PET_TYPES.map((petType) => (
          <section key={petType} className={styles.group}>
            <h2 className={styles.groupTitle}>{petType} breeds</h2>
            {(breedsByType.get(petType) ?? []).length === 0 ? (
              <p className={styles.copy}>
                No {petType.toLowerCase()} breeds yet.
              </p>
            ) : (
              <ul className={styles.list}>
                {(breedsByType.get(petType) ?? []).map((breed) => (
                  <li className={styles.listItem} key={breed.id}>
                    {editingId === breed.id ? (
                      <>
                        <input
                          className={styles.input}
                          value={editingName}
                          onChange={(event) =>
                            setEditingName(event.target.value)
                          }
                        />
                        <button
                          type="button"
                          className={styles.smallButton}
                          onClick={() => void handleRename(breed.id)}
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
                        <span className={styles.breedName}>{breed.name}</span>
                        <button
                          type="button"
                          className={styles.smallButtonSecondary}
                          onClick={() => startEditing(breed)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className={styles.smallButtonSecondary}
                          onClick={() => void handleDelete(breed.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}

      {rowError ? (
        <p className={styles.errorBanner} role="alert">
          {rowError}
        </p>
      ) : null}
    </main>
  );
}
