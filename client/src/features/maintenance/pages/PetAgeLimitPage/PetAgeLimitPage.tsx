import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  getPetAgeConfiguration,
  updatePetAgeConfiguration,
} from '../../api/maintenance.api';
import type { PetAgeConfiguration } from '../../maintenance.types';
import {
  earliestDateOfBirth,
  RECORD_MAX_PET_AGE_YEARS,
} from '../../utils/petAgeLimit';
import { todayDateKey } from '../../../../shared/utils/isFutureDate';
import { useUnsavedChanges } from '../../../../shared/providers/UnsavedChangesProvider/useUnsavedChanges';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import styles from './PetAgeLimitPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side - the PATCH route is
 * adminWrite, like Pet Types and Breeds beside it in the Pets tile. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

/** `YYYY-MM-DD` -> e.g. "30 October 1988", built from the parts so no
 * timezone shift can move it a day. */
function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Custom change (pet age limit): the oldest a pet may be when it's added,
 * so a mistyped date of birth can't register a 100-year-old dog. Lives as
 * the Pets tile's third section (AdminPetsPage). Capped at the 38-year
 * record - the input, this page's own check, the server validator and the
 * pet_age_configuration CHECK all enforce it.
 */
export function PetAgeLimitPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [configuration, setConfiguration] =
    useState<PetAgeConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [maxAgeYears, setMaxAgeYears] = useState('');
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

    void getPetAgeConfiguration(accessToken)
      .then((result) => {
        if (!isMounted) {
          return;
        }

        setIsLoading(false);

        if (result.error || !result.data) {
          setLoadError(result.error ?? 'Could not load the pet age limit.');
          return;
        }

        setConfiguration(result.data);
        setMaxAgeYears(String(result.data.max_age_years));
      })
      .catch(() => {
        if (isMounted) {
          setIsLoading(false);
          setLoadError('Could not load the pet age limit.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const performSave = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const years = Number(maxAgeYears);

    if (
      !Number.isInteger(years) ||
      years < 1 ||
      years > RECORD_MAX_PET_AGE_YEARS
    ) {
      const message = `Enter a whole number of years from 1 to ${RECORD_MAX_PET_AGE_YEARS}.`;
      setFormError(message);
      throw new Error(message);
    }

    setIsSubmitting(true);
    setFormError(null);
    setMessage(null);

    const result = await updatePetAgeConfiguration(accessToken, {
      max_age_years: years,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      const message = result.error ?? 'Could not update the pet age limit.';
      setFormError(message);
      throw new Error(message);
    }

    setConfiguration(result.data);
    setMaxAgeYears(String(result.data.max_age_years));
    setMessage('Pet age limit updated.');
  }, [accessToken, maxAgeYears]);

  const handleDiscard = useCallback(() => {
    if (!configuration) {
      return;
    }
    setFormError(null);
    setMaxAgeYears(String(configuration.max_age_years));
  }, [configuration]);

  const isDirty = useMemo(
    () =>
      configuration !== null &&
      maxAgeYears !== String(configuration.max_age_years),
    [configuration, maxAgeYears]
  );

  useUnsavedChanges({
    id: 'pet-age-limit',
    label: 'Pet Age Limit',
    isDirty,
    onSave: performSave,
    onDiscard: handleDiscard,
  });

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the pet age limit panel.
          </p>
        </div>
      </main>
    );
  }

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <LoadingState />
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
          <LoadingState label="Loading pet age limit..." />
        </div>
      </main>
    );
  }

  if (loadError || !configuration) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            {loadError ?? 'Pet age limit could not be loaded.'}
          </p>
        </div>
      </main>
    );
  }

  const previewYears = Number(maxAgeYears);
  const isPreviewValid =
    Number.isInteger(previewYears) &&
    previewYears >= 1 &&
    previewYears <= RECORD_MAX_PET_AGE_YEARS;

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Age Limit</h1>
        <p className={styles.copy}>
          The oldest a pet can be when it&apos;s added. A date of birth that
          makes the pet older than this is rejected, which catches typos like
          1925 instead of 2025. Pets already registered are not affected.
        </p>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void performSave().catch(() => {
              // formError is already set and shown below - nothing else to do.
            });
          }}
        >
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Maximum pet age</span>
            <span className={styles.inputRow}>
              <input
                className={styles.input}
                type="number"
                min="1"
                max={RECORD_MAX_PET_AGE_YEARS}
                step="1"
                inputMode="numeric"
                aria-describedby="pet-age-limit-hint"
                value={maxAgeYears}
                onChange={(event) => setMaxAgeYears(event.target.value)}
                required
              />
              <span className={styles.unit}>years</span>
            </span>
          </label>
          <p className={styles.hint} id="pet-age-limit-hint">
            {isPreviewValid
              ? `Pets born before ${formatDateKey(
                  earliestDateOfBirth(todayDateKey(), previewYears)
                )} can't be added. `
              : null}
            Up to {RECORD_MAX_PET_AGE_YEARS} years, the oldest pet on record.
          </p>

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
              {isSubmitting ? 'Saving...' : 'Save age limit'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
