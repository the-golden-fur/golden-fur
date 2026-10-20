import { useState } from 'react';
import styles from './PetAvatar.module.css';

export type PetAvatarSize = 'xs' | 'sm' | 'card' | 'profile';

interface PetAvatarProps {
  name: string;
  /** pets.photo_url - the first letter of the name is shown when there is
   * none, or when the image fails to load. */
  photoUrl?: string | null;
  size?: PetAvatarSize;
}

/**
 * A pet's photo, round, wherever the pet is shown by identity - cards, queue
 * rows, panel headers. Shared so a photo the customer uploads shows the same
 * way on every page.
 */
export function PetAvatar({ name, photoUrl, size = 'card' }: PetAvatarProps) {
  // Remember which URL failed rather than a plain flag, so a new photo gets
  // its own chance to load.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const className = `${styles.avatar} ${styles[size]}`;

  if (photoUrl && photoUrl !== failedUrl) {
    return (
      <img
        className={className}
        src={photoUrl}
        alt={`${name}'s photo`}
        loading="lazy"
        onError={() => setFailedUrl(photoUrl)}
      />
    );
  }

  return (
    <span className={`${className} ${styles.fallback}`} aria-hidden="true">
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
