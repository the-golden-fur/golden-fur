import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  getPricingConfiguration,
  updatePricingConfiguration,
} from '../../api/maintenance.api';
import { PricingMatrixPreview } from '../../components/PricingMatrixPreview/PricingMatrixPreview';
import {
  PRICING_RULE_TYPES,
  type PricingConfiguration,
  type PricingRuleType,
} from '../../maintenance.types';
import styles from './PricingConfigurationPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

const RULE_TYPE_LABELS: Record<PricingRuleType, string> = {
  multiplier: 'Multiplier',
  flat: 'Flat add-on (PHP)',
  percentage: 'Percentage add-on (% of base price)',
};

interface RuleFormState {
  type: PricingRuleType;
  value: string;
}

interface FormState {
  sizeSmall: RuleFormState;
  sizeMedium: RuleFormState;
  sizeLarge: RuleFormState;
  sizeExtraLarge: RuleFormState;
  coatLong: RuleFormState;
}

function formStateFromConfiguration(config: PricingConfiguration): FormState {
  return {
    sizeSmall: {
      type: config.size_s_rule_type,
      value: String(config.size_s_rule_value),
    },
    sizeMedium: {
      type: config.size_m_rule_type,
      value: String(config.size_m_rule_value),
    },
    sizeLarge: {
      type: config.size_l_rule_type,
      value: String(config.size_l_rule_value),
    },
    sizeExtraLarge: {
      type: config.size_xl_rule_type,
      value: String(config.size_xl_rule_value),
    },
    coatLong: {
      type: config.coat_long_rule_type,
      value: String(config.coat_long_rule_value),
    },
  };
}

interface RuleFieldProps {
  legend: string;
  rule: RuleFormState;
  onChange: (rule: RuleFormState) => void;
}

/**
 * One size/coat rule: a type selector (Multiplier/Flat add-on/Percentage
 * add-on) plus its value - custom change (configurable pricing rules), on
 * live follow-up feedback that "long coat is just a flat price add on,
 * shouldn't it be a multiplier as well" - every size and Long coat now
 * configure their own type independently instead of size always being a
 * multiplier and coat always being a flat add-on.
 */
function RuleField({ legend, rule, onChange }: RuleFieldProps) {
  return (
    <fieldset className={styles.ruleField}>
      <legend className={styles.fieldLabel}>{legend}</legend>
      <select
        className={styles.input}
        aria-label={`${legend} type`}
        value={rule.type}
        onChange={(event) =>
          onChange({ ...rule, type: event.target.value as PricingRuleType })
        }
      >
        {PRICING_RULE_TYPES.map((type) => (
          <option key={type} value={type}>
            {RULE_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      <input
        className={styles.input}
        aria-label={`${legend} value`}
        type="number"
        min={rule.type === 'multiplier' ? '0.01' : '0'}
        step="0.01"
        inputMode="decimal"
        value={rule.value}
        onChange={(event) => onChange({ ...rule, value: event.target.value })}
        required
      />
    </fieldset>
  );
}

/**
 * Issue #81: single shared calculation that drives every Grooming service's
 * derived size/coat matrix - its own Maintenance sub-page rather than a modal
 * on a service form, since the rule is shared across services, not owned by
 * one (#81 Dev Notes). Custom change (configurable pricing rules): each size
 * (Small/Medium/Large/Extra Large) and Long coat now configure their own
 * rule type (Multiplier/Flat add-on/Percentage add-on) independently,
 * instead of size always being a multiplier and coat always a flat add-on.
 */
export function PricingConfigurationPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [configuration, setConfiguration] =
    useState<PricingConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [previewBasePrice, setPreviewBasePrice] = useState('500');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) {
      return;
    }

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) {
      return;
    }

    let isMounted = true;

    void getPricingConfiguration(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load pricing configuration.');
        return;
      }

      setConfiguration(result.data);
      setForm(formStateFromConfiguration(result.data));
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken || !form) {
      return;
    }

    const rules = [
      { label: 'Small size', rule: form.sizeSmall },
      { label: 'Medium size', rule: form.sizeMedium },
      { label: 'Large size', rule: form.sizeLarge },
      { label: 'Extra Large size', rule: form.sizeExtraLarge },
      { label: 'Long coat', rule: form.coatLong },
    ];

    for (const { label, rule } of rules) {
      const value = Number(rule.value);

      if (!(value >= 0) || (rule.type === 'multiplier' && !(value > 0))) {
        setFormError(
          rule.type === 'multiplier'
            ? `${label}'s multiplier must be a positive number.`
            : `${label}'s value must be zero or more.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    setFormError(null);

    const result = await updatePricingConfiguration(accessToken, {
      size_s_rule_type: form.sizeSmall.type,
      size_s_rule_value: Number(form.sizeSmall.value),
      size_m_rule_type: form.sizeMedium.type,
      size_m_rule_value: Number(form.sizeMedium.value),
      size_l_rule_type: form.sizeLarge.type,
      size_l_rule_value: Number(form.sizeLarge.value),
      size_xl_rule_type: form.sizeExtraLarge.type,
      size_xl_rule_value: Number(form.sizeExtraLarge.value),
      coat_long_rule_type: form.coatLong.type,
      coat_long_rule_value: Number(form.coatLong.value),
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(
        result.error ?? 'Could not update the pricing configuration.'
      );
      return;
    }

    setConfiguration(result.data);
    setForm(formStateFromConfiguration(result.data));
    setMessage('Pricing configuration updated.');
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the pricing configuration panel.
          </p>
        </div>
      </main>
    );
  }

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (!isAllowedViewer) {
    return <Navigate to="/staff/settings" replace />;
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading pricing configuration...</p>
        </div>
      </main>
    );
  }

  if (loadError || !configuration || !form) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            {loadError ?? 'Pricing configuration could not be loaded.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Pricing Configuration</h1>
        <p className={styles.copy}>
          One shared calculation drives every Grooming service&apos;s size/coat
          matrix. Each size, and Long coat, has its own independently
          configurable rule - a Multiplier scales the price, a Flat add-on adds
          a fixed peso amount, and a Percentage add-on adds a percentage of the
          service&apos;s own base price. Changing a rule here updates the
          derived matrix everywhere it is shown, not just one service.
        </p>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        <form className={styles.form} onSubmit={handleSubmit}>
          <RuleField
            legend="Small size"
            rule={form.sizeSmall}
            onChange={(rule) =>
              setForm((prev) => prev && { ...prev, sizeSmall: rule })
            }
          />
          <RuleField
            legend="Medium size"
            rule={form.sizeMedium}
            onChange={(rule) =>
              setForm((prev) => prev && { ...prev, sizeMedium: rule })
            }
          />
          <RuleField
            legend="Large size"
            rule={form.sizeLarge}
            onChange={(rule) =>
              setForm((prev) => prev && { ...prev, sizeLarge: rule })
            }
          />
          <RuleField
            legend="Extra Large size"
            rule={form.sizeExtraLarge}
            onChange={(rule) =>
              setForm((prev) => prev && { ...prev, sizeExtraLarge: rule })
            }
          />
          <RuleField
            legend="Long coat"
            rule={form.coatLong}
            onChange={(rule) =>
              setForm((prev) => prev && { ...prev, coatLong: rule })
            }
          />

          {formError ? (
            <p className={styles.errorBanner} role="alert">
              {formError}
            </p>
          ) : null}

          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save pricing configuration'}
            </button>
          </div>
        </form>

        <section aria-labelledby="preview-heading">
          <h2 className={styles.sectionTitle} id="preview-heading">
            Preview
          </h2>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Sample base price (PHP)</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={previewBasePrice}
              onChange={(event) => setPreviewBasePrice(event.target.value)}
            />
          </label>
          <PricingMatrixPreview
            basePrice={Number(previewBasePrice) || 0}
            configuration={{
              ...configuration,
              size_s_rule_type: form.sizeSmall.type,
              size_s_rule_value:
                Number(form.sizeSmall.value) || configuration.size_s_rule_value,
              size_m_rule_type: form.sizeMedium.type,
              size_m_rule_value:
                Number(form.sizeMedium.value) ||
                configuration.size_m_rule_value,
              size_l_rule_type: form.sizeLarge.type,
              size_l_rule_value:
                Number(form.sizeLarge.value) || configuration.size_l_rule_value,
              size_xl_rule_type: form.sizeExtraLarge.type,
              size_xl_rule_value:
                Number(form.sizeExtraLarge.value) ||
                configuration.size_xl_rule_value,
              coat_long_rule_type: form.coatLong.type,
              coat_long_rule_value:
                form.coatLong.value === ''
                  ? configuration.coat_long_rule_value
                  : Number(form.coatLong.value),
            }}
          />
        </section>
      </div>
    </main>
  );
}
