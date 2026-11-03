import { useEffect, useId, useRef, useState } from 'react';
import { listBreeds } from '../../../api/customer.api';
import type { Breed, PetType } from '../../../customer.types';
import styles from './BreedSelect.module.css';

/** Mirrors pets_breed_other_length_check (...20261103002). */
const BREED_OTHER_MAX_LENGTH = 80;

interface BreedSelectProps {
  /** Scopes the dropdown to this pet_type's breeds - a Dog profile only
   * shows Dog breeds and vice versa (Issue #77). */
  petType: PetType;
  /** Currently selected breed id, or null if none selected yet. */
  value: string | null;
  onChange: (breedId: string | null) => void;
  /** Typed-in breed when it isn't in the list (pets.breed_other). Mutually
   * exclusive with `value` - picking either clears the other. */
  otherValue: string | null;
  onOtherChange: (breedOther: string | null) => void;
}

/**
 * Issue #77: searchable/dropdown breed picker, replacing the old free-text
 * breed input. Reuses existing Sprint 1/Sprint 2 input styles rather than
 * introducing new ones (per the Epic A Styles workbook - this is a new
 * field instance, not a new interaction pattern).
 *
 * A breed that isn't listed can still be recorded: when the search text has
 * no exact match, a last "Use ..." option saves it as free text
 * (pets.breed_other) instead of a breeds row - the breeds list itself stays
 * admin-managed.
 */
export function BreedSelect({
  petType,
  value,
  onChange,
  otherValue,
  onOtherChange,
}: BreedSelectProps) {
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const hintId = useId();

  // The breed already on the pet stays in the list even if an admin has since
  // archived it, so its name keeps showing - archived breeds are otherwise
  // hidden from the picker. Read once (not a dependency): re-fetching on every
  // selection would be pointless churn.
  const initialValueRef = useRef(value);

  useEffect(() => {
    let isMounted = true;

    void listBreeds(petType, initialValueRef.current).then((result) => {
      if (isMounted) {
        setBreeds(result.data ?? []);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [petType]);

  const selected = breeds.find((breed) => breed.id === value) ?? null;
  const query = search.trim();
  const filtered = breeds.filter((breed) =>
    breed.name.toLowerCase().includes(query.toLowerCase())
  );
  const hasExactMatch = breeds.some(
    (breed) => breed.name.toLowerCase() === query.toLowerCase()
  );
  const canUseTyped =
    query.length > 0 &&
    query.length <= BREED_OTHER_MAX_LENGTH &&
    !hasExactMatch;
  const isCustom = !selected && Boolean(otherValue);

  return (
    <div className={styles.wrapper}>
      <input
        className={styles.input}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-describedby={isCustom ? hintId : undefined}
        placeholder="Search breed..."
        value={isOpen ? search : (selected?.name ?? otherValue ?? '')}
        onFocus={() => {
          setIsOpen(true);
          setSearch('');
        }}
        onChange={(event) => {
          setSearch(event.target.value);
          onChange(null);
          onOtherChange(null);
        }}
        onBlur={() => {
          // Delay so a click on a listbox option registers before the list
          // unmounts.
          setTimeout(() => setIsOpen(false), 150);
        }}
      />
      {isOpen ? (
        <ul className={styles.listbox} role="listbox">
          {filtered.length === 0 && !canUseTyped ? (
            <li className={styles.empty}>No matching breeds</li>
          ) : null}
          {filtered.map((breed) => (
            <li key={breed.id} role="option" aria-selected={breed.id === value}>
              <button
                type="button"
                className={styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(breed.id);
                  onOtherChange(null);
                  setSearch('');
                  setIsOpen(false);
                }}
              >
                {breed.name}
              </button>
            </li>
          ))}
          {canUseTyped ? (
            <li
              role="option"
              aria-selected={false}
              className={filtered.length > 0 ? styles.otherDivider : undefined}
            >
              <button
                type="button"
                className={styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(null);
                  onOtherChange(query);
                  setSearch('');
                  setIsOpen(false);
                }}
              >
                Use "{query}"{' '}
                <span className={styles.otherNote}>(not listed)</span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {isCustom && !isOpen ? (
        <span id={hintId} className={styles.hint}>
          Not in our breed list
        </span>
      ) : null}
    </div>
  );
}
