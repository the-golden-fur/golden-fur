import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile, updateStaffProfile } from '../../api/staff.api';
import { AvatarUploader } from '../../components/forms/AvatarUploader/AvatarUploader';
import { UnavailabilityBlockForm } from '../../components/forms/UnavailabilityBlockForm/UnavailabilityBlockForm';
import { UnavailabilityBlockBadge } from '../../components/badges/UnavailabilityBlockBadge/UnavailabilityBlockBadge';
import type { CommunicationChannel, StaffProfile } from '../../staff.types';
import styles from './StaffProfilePage.module.css';

const COMMUNICATION_CHANNELS: CommunicationChannel[] = [
  'Call',
  'Text',
  'Viber',
  'Messenger',
];

export function StaffProfilePage() {
  const { user, accessToken } = useAuth();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactNumber, setEmergencyContactNumber] = useState('');
  const [commsChannel, setCommsChannel] = useState<CommunicationChannel | ''>(
    ''
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [blockRefreshKey, setBlockRefreshKey] = useState(0);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !accessToken) {
      return;
    }

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load your profile.');
        return;
      }

      setProfile(result.data);
      setDisplayName(result.data.display_name);
      setPhoneNumber(result.data.phone_number ?? '');
      setEmergencyContactName(result.data.emergency_contact_name ?? '');
      setEmergencyContactNumber(result.data.emergency_contact_number ?? '');
      setCommsChannel(result.data.preferred_communication_channel ?? '');
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, accessToken]);

  const handleAvatarUploaded = (url: string) => {
    setProfile((prev) => (prev ? { ...prev, profile_photo_url: url } : prev));
  };

  const handleBlockCreated = () => {
    setBlockRefreshKey((key) => key + 1);
    setBlockMessage('Unavailability block created.');
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile || !accessToken) {
      return;
    }

    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);

    const result = await updateStaffProfile(profile.id, accessToken, {
      display_name: displayName,
      phone_number: phoneNumber,
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
        <div className={styles.identitySection}>
          <AvatarUploader
            staffId={profile.id}
            accessToken={accessToken}
            currentAvatarUrl={profile.profile_photo_url}
            onUploaded={handleAvatarUploaded}
          />
          <div className={styles.identityInfo}>
            <h2 className={styles.name}>{profile.display_name}</h2>
            <span className={styles.role}>{profile.role}</span>
            <UnavailabilityBlockBadge
              staffId={profile.id}
              accessToken={accessToken}
              refreshKey={blockRefreshKey}
            />
          </div>
        </div>

        <form
          className={styles.form}
          onSubmit={(event) => void handleSave(event)}
        >
          <label className={styles.field}>
            <span className={styles.label}>Display name</span>
            <input
              className={styles.input}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Phone number</span>
            <input
              className={styles.input}
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
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
          className={styles.blockSection}
          aria-labelledby="unavailability-block-title"
        >
          <h2 className={styles.sectionTitle} id="unavailability-block-title">
            Unavailability Block
          </h2>
          {blockMessage ? (
            <p className={styles.successBanner}>{blockMessage}</p>
          ) : null}
          <UnavailabilityBlockForm
            staffId={profile.id}
            accessToken={accessToken}
            onCreated={handleBlockCreated}
          />
        </section>
      </section>
    </main>
  );
}
