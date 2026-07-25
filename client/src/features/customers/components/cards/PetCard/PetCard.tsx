import { Link } from 'react-router';
import type { Pet } from '../../../customer.types';
import styles from './PetCard.module.css';

interface PetCardProps {
  pet: Pet;
  /** Where this card links to - defaults to the customer portal's own pet
   * profile. Staff contexts (e.g. Customer Management's "View Pets" panel,
   * Issue #76) pass '/staff/pets' instead, since /portal/pets/:id is gated
   * by CustomerAuthGuard and would otherwise redirect a staff viewer away. */
  linkBasePath?: string;
}

export function PetCard({ pet, linkBasePath = '/portal/pets' }: PetCardProps) {
  return (
    <Link className={styles.card} to={`${linkBasePath}/${pet.id}`}>
      <div className={styles.header}>
        {pet.photo_url ? (
          <img
            className={styles.avatar}
            src={pet.photo_url}
            alt={`${pet.name}'s photo`}
          />
        ) : (
          <span className={styles.avatarFallback} aria-hidden="true">
            {pet.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className={styles.identity}>
          <h3 className={styles.name}>{pet.name}</h3>
          <span className={styles.subtitle}>{pet.pet_type}</span>
        </div>
      </div>
      <div className={styles.badges}>
        <span className={styles.badge}>{pet.weight_class}</span>
        <span className={styles.badge}>{pet.coat_type}</span>
      </div>
    </Link>
  );
}
