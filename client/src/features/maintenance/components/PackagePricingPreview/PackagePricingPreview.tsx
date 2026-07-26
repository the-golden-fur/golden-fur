import { useState } from 'react';
import { deriveBundledPrice } from '../../utils/deriveBundledPrice';
import type { PackagePricingConfiguration } from '../../maintenance.types';
import styles from './PackagePricingPreview.module.css';

interface PackagePricingPreviewProps {
  includedServiceBasePrices: number[];
  configuration: PackagePricingConfiguration;
  onSaveDiscount: (bundleDiscountPercentage: number) => void;
  isSavingDiscount?: boolean;
}

/**
 * Read-only computed bundled-price display, recalculating live as services
 * are added/removed from the package (#83) - plus the small
 * bundle_discount_percentage admin control, inline here rather than a
 * separate page since a package is edited one at a time (#83 Dev Notes).
 * A zero-service selection shows a clear empty state, not an error (AC-4).
 *
 * A plain div, not a <form> - this renders inside AdminPackageBuilderPage's
 * own package <form>, and HTML forms cannot nest (a nested <form> gets
 * hoisted out by the parser, silently routing this submit to the outer
 * package form instead).
 */
export function PackagePricingPreview({
  includedServiceBasePrices,
  configuration,
  onSaveDiscount,
  isSavingDiscount = false,
}: PackagePricingPreviewProps) {
  const [discountInput, setDiscountInput] = useState(
    String(configuration.bundle_discount_percentage * 100)
  );

  const handleSaveDiscount = () => {
    const percentage = Number(discountInput);

    if (!(percentage >= 0) || percentage > 100) {
      return;
    }

    onSaveDiscount(percentage / 100);
  };

  return (
    <section className={styles.preview} aria-labelledby="package-pricing-heading">
      <h3 className={styles.heading} id="package-pricing-heading">
        Bundled price (derived, read-only)
      </h3>

      {includedServiceBasePrices.length === 0 ? (
        <p className={styles.emptyState}>
          Add two or more services to see the bundled price.
        </p>
      ) : (
        <p className={styles.price}>
          PHP{' '}
          {deriveBundledPrice(includedServiceBasePrices, configuration).toFixed(2)}
        </p>
      )}

      <div className={styles.discountForm}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Bundle discount (%)</span>
          <input
            className={styles.input}
            type="number"
            min="0"
            max="100"
            step="0.01"
            inputMode="decimal"
            value={discountInput}
            onChange={(event) => setDiscountInput(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={isSavingDiscount}
          onClick={handleSaveDiscount}
        >
          {isSavingDiscount ? 'Saving...' : 'Save discount %'}
        </button>
      </div>
    </section>
  );
}
