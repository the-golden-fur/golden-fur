import { useEffect, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listCustomerPets } from '../../api/customer.api';
import { PetCard } from '../../components/cards/PetCard/PetCard';
import { PetForm } from '../../components/forms/PetForm/PetForm';
import type { Pet } from '../../customer.types';
import styles from './CustomerPetManagerPage.module.css';

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
          <div className={styles.petsGrid}>
            {pets.map((pet) => (
              <PetCard key={pet.id} pet={pet} />
            ))}
          </div>
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
