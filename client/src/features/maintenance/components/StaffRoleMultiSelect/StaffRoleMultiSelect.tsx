import { ALL_STAFF_ROLES, type StaffRole } from '../../../staff/staff.types';
import styles from './StaffRoleMultiSelect.module.css';

interface StaffRoleMultiSelectProps {
  /** Accessible group name, e.g. "Eligible staff roles". */
  label: string;
  selectedRoles: string[];
  onChange: (selectedRoles: string[]) => void;
  disabled?: boolean;
}

/**
 * Checkbox multiselect over the fixed 8-role staff_role enum - same
 * {label, selected*, onChange} shape as BranchMultiSelect, but over a
 * static list rather than a fetched one, so it skips BranchMultiSelect's
 * SearchSortBar/useSearchAndSort (not worth it for a short, unchanging
 * list). Used by AdminServiceTypesPage to pick which staff roles the
 * Staff Picker offers for a service type - e.g. Grooming -> Groomer,
 * Veterinary -> Veterinarian.
 */
export function StaffRoleMultiSelect({
  label,
  selectedRoles,
  onChange,
  disabled = false,
}: StaffRoleMultiSelectProps) {
  const selected = new Set(selectedRoles);

  const handleToggle = (role: StaffRole) => {
    const next = new Set(selected);

    if (next.has(role)) {
      next.delete(role);
    } else {
      next.add(role);
    }

    onChange(ALL_STAFF_ROLES.filter((r) => next.has(r)));
  };

  return (
    <fieldset className={styles.multiSelect}>
      <legend className={styles.legend}>{label}</legend>

      <ul className={styles.optionList}>
        {ALL_STAFF_ROLES.map((role) => (
          <li key={role} className={styles.optionItem}>
            <label className={styles.optionLabel}>
              <input
                type="checkbox"
                checked={selected.has(role)}
                disabled={disabled}
                onChange={() => handleToggle(role)}
              />
              <span>{role}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
