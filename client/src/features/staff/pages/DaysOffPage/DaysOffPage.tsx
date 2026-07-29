import { useEffect, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../api/staff.api';
import { UnavailabilityBlockForm } from '../../components/forms/UnavailabilityBlockForm/UnavailabilityBlockForm';
import { UnavailabilityBlockBadge } from '../../components/badges/UnavailabilityBlockBadge/UnavailabilityBlockBadge';
import type { StaffProfile } from '../../staff.types';
import styles from './DaysOffPage.module.css';

/**
 * Self-service day-off requests, reachable from every role's dashboard
 * (staffDashboard.config.ts) rather than buried inside My Profile - a staff
 * member requesting time off isn't editing their profile, and the previous
 * placement meant Receptionists/Groomers/etc. had no dashboard-visible way
 * to find it at all.
 */
export function DaysOffPage() {
  const { user, accessToken } = useAuth();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, accessToken]);

  const handleBlockCreated = () => {
    setBlockRefreshKey((key) => key + 1);
    setBlockMessage('Day-off request created.');
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your days off.
        </p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.copy}>Loading...</p>
      </main>
    );
  }

  if (loadError || !profile) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          {loadError ?? 'Unable to load your days off.'}
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Days Off</h1>

      <section className={styles.panel}>
        <UnavailabilityBlockBadge
          staffId={profile.id}
          accessToken={accessToken}
          refreshKey={blockRefreshKey}
        />

        {blockMessage ? (
          <p className={styles.successBanner}>{blockMessage}</p>
        ) : null}

        <UnavailabilityBlockForm
          staffId={profile.id}
          accessToken={accessToken}
          onCreated={handleBlockCreated}
        />
      </section>
    </main>
  );
}
