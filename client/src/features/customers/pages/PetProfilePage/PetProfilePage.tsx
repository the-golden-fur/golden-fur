import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getPet } from '../../api/customer.api';
import { PetDetailPanel } from '../../components/panels/PetDetailPanel/PetDetailPanel';
import type { Pet } from '../../customer.types';
import styles from './PetProfilePage.module.css';

export function PetProfilePage() {
  const { petId } = useParams<{ petId: string }>();
  const { accessToken } = useAuth();
  const [pet, setPet] = useState<Pet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!petId || !accessToken) {
      return;
    }

    let isMounted = true;

    void getPet(petId, accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load this pet.');
        return;
      }

      setPet(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [petId, accessToken]);

  if (!petId || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load this pet.
        </p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading pet...</p>
      </main>
    );
  }

  // AC-6: a server-side 403/404 (a different customer's pet, or one that
  // doesn't exist) surfaces as a clear error state here, not a silent blank
  // page.
  if (loadError || !pet) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          {loadError ?? 'Pet not found.'}
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{pet.name}</h1>

      {/* This route only ever loads the signed-in customer's own pet -
          GET /pets/:id 403s a non-owner customer before we'd ever have
          pet data here - so editing is always allowed. */}
      <PetDetailPanel
        pet={pet}
        accessToken={accessToken}
        canEdit
        isStaff={false}
        onUpdated={setPet}
      />
    </main>
  );
}
