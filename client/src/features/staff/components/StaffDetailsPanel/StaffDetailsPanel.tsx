import { UnavailabilityBlockBadge } from '../badges/UnavailabilityBlockBadge/UnavailabilityBlockBadge';
import type { StaffProfile } from '../../staff.types';
import styles from './StaffDetailsPanel.module.css';

interface StaffDetailsPanelProps {
  profile: StaffProfile;
  branchName?: string;
  accessToken: string | null;
  /** Bump to force the badge to re-check status after an external change. */
  refreshKey?: number;
  onSetDaysOff: () => void;
  onManageAccount: () => void;
}

const EMPTY_VALUE = '—';

function getInitials(displayName: string) {
  return displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Read-only overview of one staff member, opened by clicking their card (or
 * name, in Table/List) on Staff Management. Every field comes straight off
 * the already-fetched StaffProfile - nothing is loaded here except the
 * availability badge's own check. Editing stays in the existing "Set day(s)
 * off" / "Manage account" modals, reached from the two footer actions.
 */
export function StaffDetailsPanel({
  profile,
  branchName,
  accessToken,
  refreshKey,
  onSetDaysOff,
  onManageAccount,
}: StaffDetailsPanelProps) {
  const emergencyContact = [
    profile.emergency_contact_name,
    profile.emergency_contact_number,
  ]
    .filter(Boolean)
    .join(' · ');

  const details: Array<{ label: string; value: string }> = [
    { label: 'Full name', value: profile.display_name },
    { label: 'Email', value: profile.registered_email },
    { label: 'Username', value: profile.username },
    { label: 'Role', value: profile.role },
    { label: 'Branch', value: branchName ?? EMPTY_VALUE },
    {
      label: 'Account status',
      value: profile.is_active ? 'Active' : 'Inactive',
    },
    { label: 'Contact number', value: profile.phone_number ?? EMPTY_VALUE },
    { label: 'Emergency contact', value: emergencyContact || EMPTY_VALUE },
    {
      label: 'Preferred communication',
      value: profile.preferred_communication_channel ?? EMPTY_VALUE,
    },
    { label: 'Date added', value: formatDate(profile.created_at) },
  ];

  return (
    <div className={styles.panel}>
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
          <p className={styles.name}>{profile.display_name}</p>
          <div className={styles.badges}>
            <span className={styles.roleBadge}>{profile.role}</span>
            <UnavailabilityBlockBadge
              staffId={profile.id}
              accessToken={accessToken}
              refreshKey={refreshKey}
            />
          </div>
        </div>
      </div>

      <dl className={styles.details}>
        {details.map((detail) => (
          <div className={styles.detail} key={detail.label}>
            <dt className={styles.detailLabel}>{detail.label}</dt>
            <dd className={styles.detailValue}>{detail.value}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onSetDaysOff}
        >
          Set day(s) off
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={onManageAccount}
        >
          Manage account
        </button>
      </div>
    </div>
  );
}
