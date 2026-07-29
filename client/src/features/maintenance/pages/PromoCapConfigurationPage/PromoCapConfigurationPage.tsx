import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  listBranches,
  listPromoCapConfigurations,
  upsertPromoCapConfiguration,
} from '../../api/maintenance.api';
import { PromoCapCard } from '../../components/PromoCapCard/PromoCapCard';
import type {
  BranchSummary,
  CapType,
  PromoCapConfiguration,
} from '../../maintenance.types';
import styles from './PromoCapConfigurationPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

const DEFAULT_SCOPE_KEY = 'default';

export function PromoCapConfigurationPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [capConfigurations, setCapConfigurations] = useState<
    PromoCapConfiguration[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingScopeKey, setSavingScopeKey] = useState<string | null>(null);
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

    void Promise.all([
      listBranches(),
      listPromoCapConfigurations(accessToken),
    ]).then(([branchesResult, capResult]) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (capResult.error || !capResult.data) {
        setLoadError(capResult.error ?? 'Could not load the promo cap.');
        return;
      }

      setBranches(branchesResult.data ?? []);
      setCapConfigurations(capResult.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const handleSave = async (
    branchId: string | null,
    scopeKey: string,
    input: { cap_type: CapType; cap_value: number }
  ) => {
    if (!accessToken) {
      return;
    }

    setSavingScopeKey(scopeKey);

    const result = await upsertPromoCapConfiguration(accessToken, {
      branch_id: branchId,
      ...input,
    });

    setSavingScopeKey(null);

    if (result.error || !result.data) {
      setMessage(result.error ?? 'Could not update the promo cap.');
      return;
    }

    const saved = result.data;
    setCapConfigurations((prev) => {
      const exists = prev.some(
        (config) => config.branch_id === saved.branch_id
      );
      return exists
        ? prev.map((config) =>
            config.branch_id === saved.branch_id ? saved : config
          )
        : [...prev, saved];
    });
    setMessage('Promo cap updated.');
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the promo cap configuration panel.
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
          <p className={styles.copy}>Loading promo cap configuration...</p>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Promo Cap Configuration</h1>
        <p className={styles.copy}>
          Maximum total discount value that all combined, customer-activated
          promos may contribute to one transaction. Each branch (and the
          system-wide default) has its own cap, viewed and saved independently.
        </p>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        <div className={styles.grid}>
          <PromoCapCard
            // Remounts (and re-seeds its local edit state) once the default
            // cap resolves from undefined to a real row on initial load - see
            // PromoCapCard's own comment for why this replaces a sync effect.
            key={`default-${capConfigurations.find((config) => config.branch_id === null)?.id ?? 'unsaved'}`}
            scopeLabel="Both branches (system-wide default)"
            config={capConfigurations.find(
              (config) => config.branch_id === null
            )}
            onSave={(input) => void handleSave(null, DEFAULT_SCOPE_KEY, input)}
            isSaving={savingScopeKey === DEFAULT_SCOPE_KEY}
          />
          {branches.map((branch) => {
            const config = capConfigurations.find(
              (candidate) => candidate.branch_id === branch.id
            );

            return (
              <PromoCapCard
                key={`${branch.id}-${config?.id ?? 'unsaved'}`}
                scopeLabel={branch.name}
                config={config}
                onSave={(input) => void handleSave(branch.id, branch.id, input)}
                isSaving={savingScopeKey === branch.id}
              />
            );
          })}
        </div>
      </div>
    </main>
  );
}
