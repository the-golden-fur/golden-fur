import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getPet } from '../../api/customer.api';
import { MedicalNoteList } from '../../components/lists/MedicalNoteList/MedicalNoteList';
import { VaccinationRecordList } from '../../components/lists/VaccinationRecordList/VaccinationRecordList';
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

      <section className={styles.panel}>
        <dl className={styles.attributes}>
          <div className={styles.attribute}>
            <dt className={styles.attributeLabel}>Species</dt>
            <dd className={styles.attributeValue}>{pet.species}</dd>
          </div>
          {pet.breed ? (
            <div className={styles.attribute}>
              <dt className={styles.attributeLabel}>Breed</dt>
              <dd className={styles.attributeValue}>{pet.breed}</dd>
            </div>
          ) : null}
          {pet.gender ? (
            <div className={styles.attribute}>
              <dt className={styles.attributeLabel}>Gender</dt>
              <dd className={styles.attributeValue}>{pet.gender}</dd>
            </div>
          ) : null}
          {pet.date_of_birth ? (
            <div className={styles.attribute}>
              <dt className={styles.attributeLabel}>Date of birth</dt>
              <dd className={styles.attributeValue}>{pet.date_of_birth}</dd>
            </div>
          ) : null}
          <div className={styles.attribute}>
            <dt className={styles.attributeLabel}>Weight class</dt>
            <dd className={styles.attributeValue}>{pet.weight_class}</dd>
          </div>
          <div className={styles.attribute}>
            <dt className={styles.attributeLabel}>Coat type</dt>
            <dd className={styles.attributeValue}>{pet.coat_type}</dd>
          </div>
          {pet.health_conditions ? (
            <div className={styles.attribute}>
              <dt className={styles.attributeLabel}>Health conditions</dt>
              <dd className={styles.attributeValue}>{pet.health_conditions}</dd>
            </div>
          ) : null}
        </dl>

        <section
          className={styles.section}
          aria-labelledby="vaccination-records-title"
        >
          <h2 className={styles.sectionTitle} id="vaccination-records-title">
            Vaccination Records
          </h2>
          <VaccinationRecordList petId={pet.id} accessToken={accessToken} />
        </section>

        <section
          className={styles.section}
          aria-labelledby="medical-notes-title"
        >
          <h2 className={styles.sectionTitle} id="medical-notes-title">
            Medical Notes
          </h2>
          <MedicalNoteList petId={pet.id} accessToken={accessToken} />
        </section>

        <section
          className={styles.section}
          aria-labelledby="service-history-title"
        >
          <h2 className={styles.sectionTitle} id="service-history-title">
            Service History
          </h2>
          {/*
            Per Modules-Features M02 Process 6 and the Agile-SprintMap
            Sprint 1 acceptance criterion ("empty list acceptable at this
            stage") - grooming/hotel/daycare/consultation records don't
            exist until Sprint 3/4, so this tab is built now and wired up
            for real once each source module ships.
          */}
          <p className={styles.copy}>No service history yet.</p>
        </section>
      </section>
    </main>
  );
}
