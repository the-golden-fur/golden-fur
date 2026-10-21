import { UnavailabilityBlockBadge } from '../../badges/UnavailabilityBlockBadge/UnavailabilityBlockBadge';
import type { StaffProfile } from '../../../staff.types';
import styles from './StaffCard.module.css';

interface StaffCardProps {
  staffId: string;
  profile: StaffProfile;
  /** Needed by the badge's underlying Supabase session check; the badge is read-only regardless of whose token this is. */
  accessToken?: string | null;
  branchName?: string;
  /** Bump to force the badge to re-check status after an external change. */
  refreshKey?: number;
  /** When set, the whole card becomes clickable (the name is the real
   * button, stretched over the card) - e.g. to open a details view. */
  onSelect?: () => void;
}

function getInitials(displayName: string) {
  return displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function StaffCard({
  staffId,
  profile,
  accessToken = null,
  branchName,
  refreshKey,
  onSelect,
}: StaffCardProps) {
  return (
    <article
      className={onSelect ? `${styles.card} ${styles.clickable}` : styles.card}
    >
      <div className={styles.header}>
        {profile.profile_photo_url ? (
          <img
            className={styles.avatar}
            src={profile.profile_photo_url}
            alt={`${profile.display_name}'s avatar`}
          />
        ) : (
          <span className={styles.avatarFallback} aria-hidden="true">
            {getInitials(profile.display_name)}
          </span>
        )}
        <div className={styles.identity}>
          <h3 className={styles.name}>
            {onSelect ? (
              <button
                type="button"
                className={styles.nameButton}
                onClick={onSelect}
              >
                {profile.display_name}
              </button>
            ) : (
              profile.display_name
            )}
          </h3>
          <span className={styles.roleBadge}>{profile.role}</span>
        </div>
      </div>
      {branchName ? <p className={styles.branch}>{branchName}</p> : null}
      <UnavailabilityBlockBadge
        staffId={staffId}
        accessToken={accessToken}
        refreshKey={refreshKey}
      />
    </article>
  );
}
