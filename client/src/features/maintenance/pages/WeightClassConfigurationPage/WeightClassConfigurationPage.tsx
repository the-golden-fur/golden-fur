import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  getPetWeightClassConfiguration,
  updatePetWeightClassConfiguration,
} from '../../api/maintenance.api';
import type { PetWeightClassConfiguration } from '../../maintenance.types';
import styles from './WeightClassConfigurationPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

interface FormState {
  mMinKg: string;
  lMinKg: string;
  xlMinKg: string;
}

function formStateFromConfiguration(
  config: PetWeightClassConfiguration
): FormState {
  return {
    mMinKg: String(config.m_min_kg),
    lMinKg: String(config.l_min_kg),
    xlMinKg: String(config.xl_min_kg),
  };
}

function bandLabel(form: FormState): string[] {
  const m = Number(form.mMinKg);
  const l = Number(form.lMinKg);
  const xl = Number(form.xlMinKg);
  return [
    `S — under ${m} kg`,
    `M — ${m} kg up to (but not including) ${l} kg`,
    `L — ${l} kg up to (but not including) ${xl} kg`,
    `XL — ${xl} kg and over`,
  ];
}

/**
 * Architectural-Change-History: the kg cut-offs that turn a pet's recorded
 * weight into an S/M/L/XL weight_class. Its own Maintenance sub-page (like
 * Pricing Configuration) since the rule is shared across Grooming pricing,
 * Hotel/Daycare cage sizing and capacity, not owned by one service.
 */
export function WeightClassConfigurationPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [configuration, setConfiguration] =
    useState<PetWeightClassConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
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

    void getPetWeightClassConfiguration(accessToken)
      .then((result) => {
        if (!isMounted) {
          return;
        }

        setIsLoading(false);

        if (result.error || !result.data) {
          setLoadError(
            result.error ?? 'Could not load the weight class configuration.'
          );
          return;
        }

        setConfiguration(result.data);
        setForm(formStateFromConfiguration(result.data));
      })
      .catch(() => {
        if (isMounted) {
          setIsLoading(false);
          setLoadError('Could not load the weight class configuration.');
        }
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

    const m = Number(form.mMinKg);
    const l = Number(form.lMinKg);
    const xl = Number(form.xlMinKg);

    if (![m, l, xl].every((value) => Number.isFinite(value) && value > 0)) {
      setFormError('Every cut-off must be a positive number of kilograms.');
      return;
    }
    if (!(m < l && l < xl)) {
      setFormError(
        'Cut-offs must increase: M must be below L, and L below XL.'
      );
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setMessage(null);

    const result = await updatePetWeightClassConfiguration(accessToken, {
      m_min_kg: m,
      l_min_kg: l,
      xl_min_kg: xl,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(
        result.error ?? 'Could not update the weight class configuration.'
      );
      return;
    }

    setConfiguration(result.data);
    setForm(formStateFromConfiguration(result.data));
    setMessage('Weight class configuration updated.');
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the weight class configuration panel.
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
          <p className={styles.copy}>Loading weight class configuration...</p>
        </div>
      </main>
    );
  }

  if (loadError || !configuration || !form) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            {loadError ?? 'Weight class configuration could not be loaded.'}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Weight Classes</h1>
        <p className={styles.copy}>
          These kilogram cut-offs decide a pet&apos;s S / M / L / XL weight
          class from the weight recorded during its assessment. The weight class
          drives Grooming pricing and Hotel / Daycare cage sizing, so changing a
          cut-off re-derives every pet&apos;s class the next time its weight is
          saved. The lower bound of each band is included.
        </p>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>M starts at (kg)</span>
            <input
              className={styles.input}
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={form.mMinKg}
              onChange={(event) =>
                setForm(
                  (prev) => prev && { ...prev, mMinKg: event.target.value }
                )
              }
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>L starts at (kg)</span>
            <input
              className={styles.input}
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={form.lMinKg}
              onChange={(event) =>
                setForm(
                  (prev) => prev && { ...prev, lMinKg: event.target.value }
                )
              }
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>XL starts at (kg)</span>
            <input
              className={styles.input}
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={form.xlMinKg}
              onChange={(event) =>
                setForm(
                  (prev) => prev && { ...prev, xlMinKg: event.target.value }
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
              {isSubmitting ? 'Saving...' : 'Save weight classes'}
            </button>
          </div>
        </form>

        <section aria-labelledby="preview-heading">
          <h2 className={styles.sectionTitle} id="preview-heading">
            Resulting bands
          </h2>
          <ul className={styles.bandList}>
            {bandLabel(form).map((label) => (
              <li key={label} className={styles.bandItem}>
                {label}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
