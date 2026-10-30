import type {
  PickableStaffFoodItem,
  PickableStaffMedicationItem,
} from '../../staffItems.types';
import styles from './StaffItemPicker.module.css';

type PickableItem = PickableStaffFoodItem | PickableStaffMedicationItem;

interface StaffItemPickerProps<T extends PickableItem> {
  items: T[];
  /** Fires with the full picked item, then the select resets to the
   * placeholder (controlled from the outside - this component holds no
   * selection state of its own). */
  onPick: (item: T) => void;
  placeholder: string;
  'aria-label': string;
}

/**
 * Plain <select> with two <optgroup>s ("My items" / "Public items") -
 * mirrors this app's existing catalog-dropdown convention (a plain select,
 * not a combobox) rather than CatalogComboBox, whose {id,name,price} shape
 * is too minimal to carry quantity/dose/unit/instructions or an owner name.
 */
export function StaffItemPicker<T extends PickableItem>({
  items,
  onPick,
  placeholder,
  'aria-label': ariaLabel,
}: StaffItemPickerProps<T>) {
  const mine = items.filter((item) => item.is_mine);
  const public_ = items.filter((item) => !item.is_mine);

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const itemId = event.target.value;
    if (!itemId) return;

    const picked = items.find((item) => item.id === itemId);
    if (picked) onPick(picked);

    // Reset to the placeholder - picking is a one-shot action, not a
    // persistent selection.
    event.target.value = '';
  }

  return (
    <select
      className={styles.select}
      aria-label={ariaLabel}
      value=""
      onChange={handleChange}
    >
      <option value="">{placeholder}</option>
      {mine.length > 0 ? (
        <optgroup label="My items">
          {mine.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {public_.length > 0 ? (
        <optgroup label="Public items">
          {public_.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {item.owner_display_name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
