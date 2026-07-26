import {
  DISCOUNT_CATEGORIES,
  type DiscountCategory,
} from '../../discounts.types';
import styles from './DiscountCategoryScopeSelect.module.css';

interface DiscountCategoryScopeSelectProps {
  value: string;
  onChange: (category: DiscountCategory) => void;
}

/**
 * Category dropdown for the discount form, shown only when scope_type =
 * Category (#85) - the existing service/package pickers continue to render
 * for their respective scope types, unchanged.
 */
export function DiscountCategoryScopeSelect({
  value,
  onChange,
}: DiscountCategoryScopeSelectProps) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>Category</span>
      <select
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value as DiscountCategory)}
        required
      >
        <option value="">Select a category...</option>
        {DISCOUNT_CATEGORIES.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </label>
  );
}
