import { StatusBadge } from '../../../../shared/components/StatusBadge/StatusBadge';
import { ToggleSwitch } from '../../../../shared/components/ToggleSwitch/ToggleSwitch';
import type { Discount } from '../../discounts.types';
import styles from './DiscountCard.module.css';

const SCOPE_LABELS: Record<Discount['scope_type'], string> = {
  service: 'Service',
  package: 'Package',
  category: 'Category',
};

interface DiscountCardProps {
  discount: Discount;
  branchName: string;
  scopeDescription: string;
  onToggle: (isActive: boolean) => void;
  onEdit: () => void;
}

/**
 * Replaces the previous table row (#85) - name, scope badge (Service/
 * Package/Category), value, and active/inactive status at a glance.
 */
export function DiscountCard({
  discount,
  branchName,
  scopeDescription,
  onToggle,
  onEdit,
}: DiscountCardProps) {
  const formattedValue =
    discount.discount_type === 'Percentage'
      ? `${discount.value}%`
      : `PHP ${discount.value.toFixed(2)}`;

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.name}>{discount.name}</h3>
        <StatusBadge isActive={discount.is_active} />
      </div>

      <div className={styles.badges}>
        <span className={styles.branchBadge}>{branchName}</span>
        <span className={styles.scopeBadge}>
          {SCOPE_LABELS[discount.scope_type]}
        </span>
      </div>

      <p className={styles.meta}>{formattedValue}</p>
      <p className={styles.meta}>{scopeDescription}</p>

      <div className={styles.controls}>
        <ToggleSwitch
          label={`${discount.is_active ? 'Disable' : 'Enable'} ${discount.name}`}
          checked={discount.is_active}
          onChange={onToggle}
        />
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onEdit}
        >
          Edit
        </button>
      </div>
    </article>
  );
}
