import { useEffect, useState } from 'react';
import type { CapType, PromoCapConfiguration } from '../../maintenance.types';
import styles from './PromoCapCard.module.css';

const CAP_TYPES: CapType[] = ['percentage', 'flat'];

interface PromoCapCardProps {
  scopeLabel: string;
  config?: PromoCapConfiguration;
  onSave: (input: { cap_type: CapType; cap_value: number }) => void;
  isSaving?: boolean;
}

/**
 * One independently-editable cap card per scope (the system-wide default or
 * a single branch) - each branch's promo cap is viewed and saved on its own,
 * not through a single form with a branch picker (the prior
 * PromoCapConfigForm design made it easy to edit one branch while believing
 * you were looking at another).
 */
export function PromoCapCard({
  scopeLabel,
  config,
  onSave,
  isSaving = false,
}: PromoCapCardProps) {
  const [capType, setCapType] = useState<CapType>(
    config?.cap_type ?? 'percentage'
  );
  const [capValue, setCapValue] = useState(String(config?.cap_value ?? 20));

  useEffect(() => {
    setCapType(config?.cap_type ?? 'percentage');
    setCapValue(String(config?.cap_value ?? 20));
  }, [config]);

  const handleSave = () => {
    const value = Number(capValue);

    if (!(value >= 0)) {
      return;
    }

    onSave({ cap_type: capType, cap_value: value });
  };

  return (
    <article className={styles.card}>
      <h3 className={styles.scopeName}>{scopeLabel}</h3>

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
              {type === 'percentage' ? 'Percentage' : 'Flat'}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          Cap value{capType === 'percentage' ? ' (%)' : ' (PHP)'}
        </span>
        <input
          className={styles.input}
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
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
    </article>
  );
}
