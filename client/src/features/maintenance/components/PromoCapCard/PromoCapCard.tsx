import { useState } from 'react';
import type { CapType, PromoCapConfiguration } from '../../maintenance.types';
import styles from './PromoCapCard.module.css';

const CAP_TYPES: CapType[] = ['percentage', 'flat', 'count'];

const CAP_TYPE_LABELS: Record<CapType, string> = {
  percentage: 'Percentage',
  flat: 'Flat',
  count: 'Number of promos',
};

interface PromoCapCardProps {
  config?: PromoCapConfiguration;
  onSave: (input: { cap_type: CapType; cap_value: number }) => void;
  isSaving?: boolean;
}

/**
 * The editable cap form for one scope (a single branch) - each branch's
 * promo cap is viewed and saved on its own, not through a single form with a
 * branch picker (the prior PromoCapConfigForm design made it easy to edit
 * one branch while believing you were looking at another). Custom change
 * (promo cap config actions menu revision): this used to render as an
 * always-visible card of its own (with its own scope-name heading); now it's
 * rendered as the body of a "Configure" modal that the parent (a branch-list
 * row's "..." menu) owns, so the scope name lives in the modal's own title
 * instead of being repeated here.
 *
 * Local state is seeded from `config` once, on mount, and never re-synced
 * via an effect - syncing derived state from a prop inside a plain effect
 * causes an extra render pass and is the exact anti-pattern
 * react-hooks/set-state-in-effect flags. Instead, the parent gives this a
 * `key` that changes when `config` first resolves (e.g. from undefined to a
 * real row once the initial fetch completes, or once a scope's first save
 * creates its row) so React remounts it with a fresh initial state rather
 * than it reacting to the prop change itself.
 */
export function PromoCapCard({
  config,
  onSave,
  isSaving = false,
}: PromoCapCardProps) {
  const [capType, setCapType] = useState<CapType>(
    config?.cap_type ?? 'percentage'
  );
  const [capValue, setCapValue] = useState(String(config?.cap_value ?? 20));

  const handleSave = () => {
    const value = Number(capValue);

    if (!(value >= 0)) {
      return;
    }

    // A 'count' cap has no notion of a fractional promo.
    if (capType === 'count' && !Number.isInteger(value)) {
      return;
    }

    onSave({ cap_type: capType, cap_value: value });
  };

  return (
    <div className={styles.form}>
      {!config ? (
        <p className={styles.emptyState}>
          No cap saved yet for this scope - showing the default values below.
        </p>
      ) : null}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Cap type</span>
        <select
          className={styles.input}
          value={capType}
          onChange={(event) => setCapType(event.target.value as CapType)}
        >
          {CAP_TYPES.map((type) => (
            <option key={type} value={type}>
              {CAP_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          Cap value
          {capType === 'percentage'
            ? ' (%)'
            : capType === 'flat'
              ? ' (PHP)'
              : ' (promos)'}
        </span>
        <input
          className={styles.input}
          type="number"
          min="0"
          step={capType === 'count' ? '1' : '0.01'}
          inputMode={capType === 'count' ? 'numeric' : 'decimal'}
          value={capValue}
          onChange={(event) => setCapValue(event.target.value)}
        />
      </label>

      <button
        type="button"
        className={styles.primaryButton}
        disabled={isSaving}
        onClick={handleSave}
      >
        {isSaving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
