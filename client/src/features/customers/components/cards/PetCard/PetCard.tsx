import { Link } from 'react-router';
import type { Pet } from '../../../customer.types';
import styles from './PetCard.module.css';

interface PetCardProps {
  pet: Pet;
}

export function PetCard({ pet }: PetCardProps) {
  return (
    <Link className={styles.card} to={`/portal/pets/${pet.id}`}>
      <div className={styles.header}>
        <span className={styles.avatarFallback} aria-hidden="true">
          {pet.name.slice(0, 1).toUpperCase()}
        </span>
        <div className={styles.identity}>
          <h3 className={styles.name}>{pet.name}</h3>
          <span className={styles.subtitle}>
            {pet.breed ? `${pet.breed} · ${pet.species}` : pet.species}
          </span>
        </div>
      </div>
      <div className={styles.badges}>
        <span className={styles.badge}>{pet.weight_class}</span>
        <span className={styles.badge}>{pet.coat_type}</span>
      </div>
    </Link>
  );
}
