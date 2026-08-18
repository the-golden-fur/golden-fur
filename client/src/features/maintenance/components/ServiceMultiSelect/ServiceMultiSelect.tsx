import styles from './ServiceMultiSelect.module.css';

export interface ServiceMultiSelectOption {
  id: string;
  label: string;
  /** e.g. category or price, rendered muted next to the label. */
  sublabel?: string;
}

interface ServiceMultiSelectProps {
  /** Accessible group name, e.g. "Included services". */
  label: string;
  options: ServiceMultiSelectOption[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  disabled?: boolean;
}

/**
 * Reusable multi-select over a list of options (#46). Kept deliberately
 * generic - a list of selected ids plus an onChange callback - because #47
 * (promo scope) and #48 (discount scope) reuse it for services AND packages,
 * per the issue's dev notes.
 */
export function ServiceMultiSelect({
  label,
  options,
  selectedIds,
  onChange,
  disabled = false,
}: ServiceMultiSelectProps) {
  const selected = new Set(selectedIds);
  const optionIds = new Set(options.map((o) => o.id));

  const handleToggle = (id: string) => {
    const next = new Set(selected);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    // Preserve the visible options' display order for ids still among
    // them, then append any previously-selected id a caller's own
    // search/filter has merely hidden (not present in `options`) - a
    // filtered-out selection must survive toggling an unrelated checkbox,
    // not get silently dropped because it's absent from the current
    // options list.
    const visible = options.map((o) => o.id).filter((oid) => next.has(oid));
    const hidden = selectedIds.filter(
      (sid) => next.has(sid) && !optionIds.has(sid)
    );
    onChange([...visible, ...hidden]);
  };

  return (
    <fieldset className={styles.multiSelect}>
      <legend className={styles.legend}>{label}</legend>
      {options.length === 0 ? (
        <p className={styles.empty}>No options available.</p>
      ) : (
        <ul className={styles.optionList}>
          {options.map((option) => (
            <li key={option.id} className={styles.optionItem}>
              <label className={styles.optionLabel}>
                <input
                  type="checkbox"
                  checked={selected.has(option.id)}
                  disabled={disabled}
                  onChange={() => handleToggle(option.id)}
                />
                <span>{option.label}</span>
                {option.sublabel ? (
                  <span className={styles.sublabel}>{option.sublabel}</span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
