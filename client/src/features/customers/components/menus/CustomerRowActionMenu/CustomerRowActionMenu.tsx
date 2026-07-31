import { useState } from 'react';
import styles from './CustomerRowActionMenu.module.css';

export type CustomerRowAction =
  | 'checkProfile'
  | 'viewPets'
  | 'addPet'
  | 'deactivate'
  | 'archive';

interface CustomerRowActionMenuProps {
  onSelect: (action: CustomerRowAction) => void;
  /** Deactivate/Archive are Admin-tier (matches the same archive workflow
   * gate used for Products/Staff) - hidden entirely for other roles. */
  canArchive?: boolean;
  isActive?: boolean;
}

/**
 * Issue #76: replaces the old "expanding a customer row always opens a
 * create-pet form" behavior with a "…" menu offering three options - Check
 * Profile, View Pets, Add Pet - so front-desk staff can pick what they
 * actually need instead of always landing on pet creation. Reuses the
 * existing button/menu visual language (border/radius/shadow tokens) rather
 * than introducing a new interaction pattern or token family.
 */
export function CustomerRowActionMenu({
  onSelect,
  canArchive = false,
  isActive = true,
}: CustomerRowActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  function handleSelect(action: CustomerRowAction) {
    setIsOpen(false);
    onSelect(action);
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Customer actions"
        onClick={() => setIsOpen((current) => !current)}
      >
        &hellip;
      </button>
      {isOpen ? (
        <ul className={styles.menu} role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => handleSelect('checkProfile')}
            >
              Check Profile
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => handleSelect('viewPets')}
            >
              View Pets
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => handleSelect('addPet')}
            >
              Add Pet
            </button>
          </li>
          {canArchive ? (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => handleSelect('deactivate')}
              >
                {isActive ? 'Deactivate' : 'Reactivate'}
              </button>
            </li>
          ) : null}
          {canArchive && !isActive ? (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => handleSelect('archive')}
              >
                Archive
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
