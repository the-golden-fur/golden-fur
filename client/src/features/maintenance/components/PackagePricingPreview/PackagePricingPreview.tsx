import { deriveBundledPrice } from '../../utils/deriveBundledPrice';
import type { PackagePricingConfiguration } from '../../maintenance.types';
import styles from './PackagePricingPreview.module.css';

interface PackagePricingPreviewProps {
  includedServiceBasePrices: number[];
  configuration: PackagePricingConfiguration;
  /** The bundle discount % input, as a "0-100" string - controlled by the
   * parent form so it saves together with the rest of the package on the
   * form's own submit, instead of this component owning a separate save
   * action. */
  discountPercentInput: string;
  onDiscountPercentInputChange: (value: string) => void;
}

/**
 * Bundled-price preview, recalculating live as services are added/removed
 * from the package (#83) and as the bundle discount % is edited - plus the
 * small bundle_discount_percentage admin input, inline here rather than a
 * separate page since a package is edited one at a time (#83 Dev Notes). A
 * zero-service selection shows a clear empty state, not an error (AC-4).
 *
 * Custom change: this used to own its own input state and a "Save
 * discount %" button that saved independently of the package's own Save
 * button. It's now a pure controlled display+input - the parent page holds
 * the input value and saves it (via package_pricing_configuration) together
 * with the rest of the package form on one submit.
 *
 * A plain div, not a <form> - this renders inside AdminPackageBuilderPage's
 * own package <form>, and HTML forms cannot nest (a nested <form> gets
 * hoisted out by the parser, silently routing this submit to the outer
 * package form instead).
 */
export function PackagePricingPreview({
  includedServiceBasePrices,
  configuration,
  discountPercentInput,
  onDiscountPercentInputChange,
}: PackagePricingPreviewProps) {
  const parsedPercent = Number(discountPercentInput);
  const hasValidPercent =
    discountPercentInput.trim() !== '' &&
    Number.isFinite(parsedPercent) &&
    parsedPercent >= 0 &&
    parsedPercent <= 100;

  // Reflects the in-progress edit, not just the last-saved config, so the
  // preview actually previews what Save will apply.
  const effectiveConfiguration = hasValidPercent
    ? { ...configuration, bundle_discount_percentage: parsedPercent / 100 }
    : configuration;

  return (
    <section
      className={styles.preview}
      aria-labelledby="package-pricing-heading"
    >
      <h3 className={styles.heading} id="package-pricing-heading">
        Bundled price
      </h3>

      {includedServiceBasePrices.length === 0 ? (
        <p className={styles.emptyState}>
          Add two or more services to see the bundled price.
        </p>
      ) : (
        <p className={styles.price}>
          PHP{' '}
          {deriveBundledPrice(
            includedServiceBasePrices,
            effectiveConfiguration
          ).toFixed(2)}
        </p>
      )}

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Bundle discount (%)</span>
        <input
          className={styles.input}
          type="number"
          min="0"
          max="100"
          step="0.01"
          inputMode="decimal"
          value={discountPercentInput}
          onChange={(event) => onDiscountPercentInputChange(event.target.value)}
        />
      </label>
    </section>
  );
}
