import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  getPricingConfiguration,
  updatePricingConfiguration,
} from '../../api/maintenance.api';
import { PricingMatrixPreview } from '../../components/PricingMatrixPreview/PricingMatrixPreview';
import type { PricingConfiguration } from '../../maintenance.types';
import styles from './PricingConfigurationPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

interface FormState {
  sizeS: string;
  sizeM: string;
  sizeL: string;
  sizeXl: string;
  longCoatAddon: string;
}

function formStateFromConfiguration(config: PricingConfiguration): FormState {
  return {
    sizeS: String(config.size_s_multiplier),
    sizeM: String(config.size_m_multiplier),
    sizeL: String(config.size_l_multiplier),
    sizeXl: String(config.size_xl_multiplier),
    longCoatAddon: String(config.long_coat_addon),
  };
}

/**
 * Issue #81: single shared calculation that drives every Grooming service's
 * derived size/coat matrix - its own Maintenance sub-page rather than a modal
 * on a service form, since the rule is shared across services, not owned by
 * one (#81 Dev Notes).
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

    const sizeS = Number(form.sizeS);
    const sizeM = Number(form.sizeM);
    const sizeL = Number(form.sizeL);
    const sizeXl = Number(form.sizeXl);
    const longCoatAddon = Number(form.longCoatAddon);

    if (
      [sizeS, sizeM, sizeL, sizeXl].some((value) => !(value > 0)) ||
      !(longCoatAddon >= 0)
    ) {
      setFormError(
        'Every size multiplier must be a positive number, and the long coat add-on must be zero or more.'
      );
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const result = await updatePricingConfiguration(accessToken, {
      size_s_multiplier: sizeS,
      size_m_multiplier: sizeM,
      size_l_multiplier: sizeL,
      size_xl_multiplier: sizeXl,
      long_coat_addon: longCoatAddon,
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
    return <Navigate to="/staff/profile" replace />;
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
      <h1 className={styles.title}>Grooming Pricing Configuration</h1>
      <p className={styles.copy}>
        One shared calculation drives every Grooming service&apos;s size/coat
        matrix. Changing a multiplier or the long coat add-on here updates the
        derived matrix everywhere it is shown, not just one service.
      </p>

      {message ? (
        <p className={styles.successBanner} role="status">
          {message}
        </p>
      ) : null}

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Size S multiplier</span>
          <input
            className={styles.input}
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={form.sizeS}
            onChange={(event) =>
              setForm((prev) => prev && { ...prev, sizeS: event.target.value })
            }
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Size M multiplier</span>
          <input
            className={styles.input}
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={form.sizeM}
            onChange={(event) =>
              setForm((prev) => prev && { ...prev, sizeM: event.target.value })
            }
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Size L multiplier</span>
          <input
            className={styles.input}
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={form.sizeL}
            onChange={(event) =>
              setForm((prev) => prev && { ...prev, sizeL: event.target.value })
            }
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Size XL multiplier</span>
          <input
            className={styles.input}
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={form.sizeXl}
            onChange={(event) =>
              setForm((prev) => prev && { ...prev, sizeXl: event.target.value })
            }
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Long coat add-on (PHP)</span>
          <input
            className={styles.input}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.longCoatAddon}
            onChange={(event) =>
              setForm(
                (prev) => prev && { ...prev, longCoatAddon: event.target.value }
              )
            }
            required
          />
        </label>

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
            size_s_multiplier:
              Number(form.sizeS) || configuration.size_s_multiplier,
            size_m_multiplier:
              Number(form.sizeM) || configuration.size_m_multiplier,
            size_l_multiplier:
              Number(form.sizeL) || configuration.size_l_multiplier,
            size_xl_multiplier:
              Number(form.sizeXl) || configuration.size_xl_multiplier,
            long_coat_addon:
              form.longCoatAddon === ''
                ? configuration.long_coat_addon
                : Number(form.longCoatAddon),
          }}
        />
      </section>
      </div>
    </main>
  );
}
