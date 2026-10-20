import { Link } from 'react-router';
import { PetAvatar } from '../../../../../shared/components/PetAvatar/PetAvatar';
import { formatRelativeTime } from '../../../../../shared/utils/formatRelativeTime';
import type { Pet } from '../../../customer.types';
import styles from './PetCard.module.css';

interface PetCardProps {
  pet: Pet;
  /** Where this card links to - defaults to the customer portal's own pet
   * profile. Staff contexts (e.g. Customer Management's "View Pets" panel,
   * Issue #76) pass '/staff/pets' instead, since /portal/pets/:id is gated
   * by CustomerAuthGuard and would otherwise redirect a staff viewer away. */
  linkBasePath?: string;
  /** Router state carried to the pet page - Customer Management passes the
   * customer panel to reopen when the pet page's Back is pressed. */
  linkState?: unknown;
}

export function PetCard({
  pet,
  linkBasePath = '/portal/pets',
  linkState,
}: PetCardProps) {
  return (
    <Link
      className={styles.card}
      to={`${linkBasePath}/${pet.id}`}
      state={linkState}
    >
      <div className={styles.header}>
        <PetAvatar name={pet.name} photoUrl={pet.photo_url} />
        <div className={styles.identity}>
          <h3 className={styles.name}>{pet.name}</h3>
          <span className={styles.subtitle}>{pet.pet_type}</span>
        </div>
      </div>
      <div className={styles.badges}>
        {pet.weight_class && pet.coat_type ? (
          <>
            <span className={styles.badge}>{pet.weight_class}</span>
            <span className={styles.badge}>{pet.coat_type}</span>
          </>
        ) : (
          <span className={styles.badge}>Not yet assessed</span>
        )}
      </div>
      {pet.assessed_at ? (
        <span className={styles.assessedAt}>
          Last assessed {formatRelativeTime(pet.assessed_at)}
        </span>
      ) : null}
    </Link>
  );
}
