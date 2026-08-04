import { useState } from 'react';
import styles from './CatalogComboBox.module.css';

export interface CatalogComboBoxItem {
  id: string;
  name: string;
  price: number;
}

export interface CatalogComboBoxValue {
  /** Set only when the value matches a catalog row exactly (selected from
   * the dropdown) - null for a freetext value not in the catalog. */
  catalogId: string | null;
  /** The display/stored text either way - a catalog item's name when
   * catalogId is set, or whatever the receptionist typed otherwise. */
  text: string;
}

interface CatalogComboBoxProps {
  items: CatalogComboBoxItem[];
  value: CatalogComboBoxValue;
  onChange: (next: CatalogComboBoxValue) => void;
  placeholder?: string;
  /** Read-only display - HotelCheckInPage's Care Instructions section uses
   * this once check-in makes feeding/walking/medication instructions
   * read-only for every staff role. */
  disabled?: boolean;
  /** Hotel's food/medication catalog items are customer-owned (or global
   * hotel-scope reference entries) with a forced price of 0 - showing "PHP
   * 0.00" next to them is meaningless, unlike Misc Sale's real-priced
   * product picker which still needs it. */
  hidePrice?: boolean;
}

/**
 * Issue #79 revision: hybrid dropdown/freetext picker for food_type and
 * medication_name - mirrors BreedSelect's combobox pattern (#77), but where
 * BreedSelect requires a catalog match, this accepts a freetext value that
 * simply never matched anything (catalogId stays null) instead of blocking
 * submission. A freetext value is never written back to the catalog table -
 * the picker only ever reads it.
 */
export function CatalogComboBox({
  items,
  value,
  onChange,
  placeholder = 'Search or type a custom value...',
  disabled = false,
  hidePrice = false,
}: CatalogComboBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className={styles.wrapper}>
      <input
        className={styles.input}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={isOpen ? search : value.text}
        disabled={disabled}
        onFocus={() => {
          if (disabled) return;
          setIsOpen(true);
          setSearch(value.text);
        }}
        onChange={(event) => {
          setSearch(event.target.value);
          // Typing invalidates any prior catalog match - freetext until the
          // receptionist explicitly picks an option again.
          onChange({ catalogId: null, text: event.target.value });
        }}
        onBlur={() => {
          // Delay so a click on a listbox option registers before the list
          // unmounts (BreedSelect's own convention).
          setTimeout(() => setIsOpen(false), 150);
        }}
      />
      {isOpen ? (
        <ul className={styles.listbox} role="listbox">
          {filtered.length === 0 ? (
            <li className={styles.empty}>
              No catalog match - "{search}" will be saved as a custom entry (not
              billable to the hotel)
            </li>
          ) : (
            filtered.map((item) => (
              <li
                key={item.id}
                role="option"
                aria-selected={item.id === value.catalogId}
              >
                <button
                  type="button"
                  className={styles.option}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange({ catalogId: item.id, text: item.name });
                    setIsOpen(false);
                  }}
                >
                  <span>{item.name}</span>
                  {hidePrice ? null : (
                    <span className={styles.optionPrice}>
                      PHP {item.price.toFixed(2)}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
