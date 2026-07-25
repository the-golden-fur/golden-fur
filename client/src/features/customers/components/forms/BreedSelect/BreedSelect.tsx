import { useEffect, useState } from 'react';
import { listBreeds } from '../../../api/customer.api';
import type { Breed, PetType } from '../../../customer.types';
import styles from './BreedSelect.module.css';

interface BreedSelectProps {
  /** Scopes the dropdown to this pet_type's breeds - a Dog profile only
   * shows Dog breeds and vice versa (Issue #77). */
  petType: PetType;
  /** Currently selected breed id, or null if none selected yet. */
  value: string | null;
  onChange: (breedId: string | null) => void;
}

/**
 * Issue #77: searchable/dropdown breed picker, replacing the old free-text
 * breed input. Reuses existing Sprint 1/Sprint 2 input styles rather than
 * introducing new ones (per the Epic A Styles workbook - this is a new
 * field instance, not a new interaction pattern).
 */
export function BreedSelect({ petType, value, onChange }: BreedSelectProps) {
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void listBreeds(petType).then((result) => {
      if (isMounted) {
        setBreeds(result.data ?? []);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [petType]);

  const selected = breeds.find((breed) => breed.id === value) ?? null;
  const filtered = breeds.filter((breed) =>
    breed.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className={styles.wrapper}>
      <input
        className={styles.input}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        placeholder="Search breed..."
        value={isOpen ? search : (selected?.name ?? '')}
        onFocus={() => {
          setIsOpen(true);
          setSearch('');
        }}
        onChange={(event) => {
          setSearch(event.target.value);
          onChange(null);
        }}
        onBlur={() => {
          // Delay so a click on a listbox option registers before the list
          // unmounts.
          setTimeout(() => setIsOpen(false), 150);
        }}
      />
      {isOpen ? (
        <ul className={styles.listbox} role="listbox">
          {filtered.length === 0 ? (
            <li className={styles.empty}>No matching breeds</li>
          ) : (
            filtered.map((breed) => (
              <li
                key={breed.id}
                role="option"
                aria-selected={breed.id === value}
              >
                <button
                  type="button"
                  className={styles.option}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(breed.id);
                    setSearch('');
                    setIsOpen(false);
                  }}
                >
                  {breed.name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
