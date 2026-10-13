import {
  CAGE_SIZE_MISMATCH_LABEL,
  type CageSizeMismatch,
} from '../../utils/cageSizeFit';
import styles from './CageSizeWarningBadge.module.css';

interface CageSizeWarningBadgeProps {
  fit: CageSizeMismatch;
}

/**
 * Warning sign shown on a cage whose size doesn't match the pet's own
 * (see cageSizeFit.ts). A <span>, so it can sit inside a cage tile that is
 * itself a <button> (CagePickerList) as well as a plain card
 * (CageStatusGrid).
 */
export function CageSizeWarningBadge({ fit }: CageSizeWarningBadgeProps) {
  return (
    <span className={styles.badge}>
      <svg
        className={styles.icon}
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M8 1.5 15 14H1L8 1.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M8 6.25v3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11.75" r="0.9" fill="currentColor" />
      </svg>
      {CAGE_SIZE_MISMATCH_LABEL[fit]}
    </span>
  );
}
