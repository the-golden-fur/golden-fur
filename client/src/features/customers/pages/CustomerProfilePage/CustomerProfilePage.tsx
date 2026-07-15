import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  getCustomerProfile,
  listCustomerPets,
  updateCustomerProfile,
} from '../../api/customer.api';
import { PetCard } from '../../components/cards/PetCard/PetCard';
import { PetForm } from '../../components/forms/PetForm/PetForm';
import type {
  CommunicationChannel,
  CustomerProfile,
  Pet,
} from '../../customer.types';
import styles from './CustomerProfilePage.module.css';

const COMMUNICATION_CHANNELS: CommunicationChannel[] = [
  'Call',
  'Text',
  'Viber',
  'Messenger',
];

export function CustomerProfilePage() {
  const { user, accessToken } = useAuth();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactNumber, setEmergencyContactNumber] = useState('');
  const [commsChannel, setCommsChannel] = useState<CommunicationChannel | ''>(
    ''
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [pets, setPets] = useState<Pet[]>([]);
  const [showPetForm, setShowPetForm] = useState(false);
  const [petMessage, setPetMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !accessToken) {
      return;
    }

    let isMounted = true;

    void getCustomerProfile(user.id, accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load your profile.');
        return;
      }

      setProfile(result.data);
      setFullName(result.data.full_name);
      setContactNumber(result.data.contact_number ?? '');
      setEmergencyContactName(result.data.emergency_contact_name ?? '');
      setEmergencyContactNumber(result.data.emergency_contact_number ?? '');
      setCommsChannel(result.data.preferred_communication_channel ?? '');
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, accessToken]);

  useEffect(() => {
    if (!user?.id || !accessToken) {
      return;
    }

    let isMounted = true;

    void listCustomerPets(user.id, accessToken).then((result) => {
      if (isMounted && result.data) {
        setPets(result.data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, accessToken]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile || !accessToken) {
      return;
    }

    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);

    const result = await updateCustomerProfile(profile.id, accessToken, {
      full_name: fullName,
      contact_number: contactNumber,
      emergency_contact_name: emergencyContactName,
      emergency_contact_number: emergencyContactNumber,
      ...(commsChannel
        ? { preferred_communication_channel: commsChannel }
        : {}),
    });

    setIsSaving(false);

    if (result.error || !result.data) {
      setSaveError(result.error ?? 'Could not save your profile.');
      return;
    }

    setProfile(result.data);
    setSaveSuccess(true);
  };

  const handlePetCreated = (pet: Pet) => {
    setPets((prev) => [...prev, pet]);
    setShowPetForm(false);
    setPetMessage('Pet added.');
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your profile.
        </p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading your profile...</p>
      </main>
    );
  }

  if (loadError || !profile) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          {loadError ?? 'Unable to load your profile.'}
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>My Profile</h1>

      <section className={styles.panel}>
        <form
          className={styles.form}
          onSubmit={(event) => void handleSave(event)}
        >
          <label className={styles.field}>
            <span className={styles.label}>Full name</span>
            <input
              className={styles.input}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Contact number</span>
            <input
              className={styles.input}
              value={contactNumber}
              onChange={(event) => setContactNumber(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Emergency contact name</span>
            <input
              className={styles.input}
              value={emergencyContactName}
              onChange={(event) => setEmergencyContactName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Emergency contact number</span>
            <input
              className={styles.input}
              value={emergencyContactNumber}
              onChange={(event) =>
                setEmergencyContactNumber(event.target.value)
              }
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Preferred communication</span>
            <select
              className={styles.input}
              value={commsChannel}
              onChange={(event) =>
                setCommsChannel(event.target.value as CommunicationChannel)
              }
            >
              <option value="">Select a channel</option>
              {COMMUNICATION_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </label>

          {saveError ? (
            <p className={styles.errorBanner} role="alert">
              {saveError}
            </p>
          ) : null}
          {saveSuccess ? (
            <p className={styles.successBanner}>Profile saved.</p>
          ) : null}

          <button className={styles.button} type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>

        <section
          className={styles.petsSection}
          aria-labelledby="pets-section-title"
        >
          <h2 className={styles.sectionTitle} id="pets-section-title">
            My Pets
          </h2>
          {petMessage ? (
            <p className={styles.successBanner}>{petMessage}</p>
          ) : null}

          {pets.length === 0 ? (
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
              customerId={profile.id}
              accessToken={accessToken}
              onCreated={handlePetCreated}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}
