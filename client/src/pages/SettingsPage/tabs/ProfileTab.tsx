import { useEffect, useState, type FormEvent } from 'react';
import {
  getStaffProfile,
  updateStaffProfile,
} from '../../../features/staff/api/staff.api';
import { AvatarUploader } from '../../../features/staff/components/forms/AvatarUploader/AvatarUploader';
import { UnavailabilityBlockBadge } from '../../../features/staff/components/badges/UnavailabilityBlockBadge/UnavailabilityBlockBadge';
import type { StaffProfile } from '../../../features/staff/staff.types';
import {
  getCustomerProfile,
  updateCustomerProfile,
} from '../../../features/customers/api/customer.api';
import type { CustomerProfile } from '../../../features/customers/customer.types';
import type { ThemeRole } from '../../../shared/providers/ThemeProvider/themeContext';
import styles from '../SettingsPage.module.css';

const COMMUNICATION_CHANNELS = ['Call', 'Text', 'Viber', 'Messenger'] as const;

interface ProfileTabProps {
  role: ThemeRole;
  userId: string;
  accessToken: string;
}

/**
 * Settings > Profile. Fields moved unchanged from the retired StaffProfilePage
 * (staff) / CustomerProfilePage (customer) - display name/phone/emergency
 * contact/comms preference, plus avatar for staff. Username and password
 * moved to the Account tab; pets moved to their own page
 * (CustomerPetManagerPage) since a customer's pet roster isn't profile data.
 */
export function ProfileTab({ role, userId, accessToken }: ProfileTabProps) {
  return role === 'staff' ? (
    <StaffProfileForm userId={userId} accessToken={accessToken} />
  ) : (
    <CustomerProfileForm userId={userId} accessToken={accessToken} />
  );
}

function StaffProfileForm({
  userId,
  accessToken,
}: {
  userId: string;
  accessToken: string;
}) {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactNumber, setEmergencyContactNumber] = useState('');
  const [commsChannel, setCommsChannel] = useState<
    (typeof COMMUNICATION_CHANNELS)[number] | ''
  >('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getStaffProfile(userId, accessToken).then((result) => {
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
  }, [userId, accessToken]);

  const handleAvatarUploaded = (url: string) => {
    setProfile((prev) => (prev ? { ...prev, profile_photo_url: url } : prev));
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile) {
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

  if (isLoading) {
    return <p className={styles.copy}>Loading your profile...</p>;
  }

  if (loadError || !profile) {
    return (
      <p className={styles.errorBanner} role="alert">
        {loadError ?? 'Unable to load your profile.'}
      </p>
    );
  }

  return (
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
            onChange={(event) => setEmergencyContactNumber(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Preferred communication</span>
          <select
            className={styles.input}
            value={commsChannel}
            onChange={(event) =>
              setCommsChannel(
                event.target.value as (typeof COMMUNICATION_CHANNELS)[number]
              )
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
    </section>
  );
}

function CustomerProfileForm({
  userId,
  accessToken,
}: {
  userId: string;
  accessToken: string;
}) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactNumber, setEmergencyContactNumber] = useState('');
  const [commsChannel, setCommsChannel] = useState<
    (typeof COMMUNICATION_CHANNELS)[number] | ''
  >('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void getCustomerProfile(userId, accessToken).then((result) => {
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
  }, [userId, accessToken]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profile) {
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

  if (isLoading) {
    return <p className={styles.copy}>Loading your profile...</p>;
  }

  if (loadError || !profile) {
    return (
      <p className={styles.errorBanner} role="alert">
        {loadError ?? 'Unable to load your profile.'}
      </p>
    );
  }

  return (
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
            onChange={(event) => setEmergencyContactNumber(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Preferred communication</span>
          <select
            className={styles.input}
            value={commsChannel}
            onChange={(event) =>
              setCommsChannel(
                event.target.value as (typeof COMMUNICATION_CHANNELS)[number]
              )
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
    </section>
  );
}
