import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LandingNavbar } from '../LandingPage/components/LandingNavbar/LandingNavbar';
import { HelpMascot } from '../../shared/components/HelpMascot/HelpMascot';
import {
  fetchPublicPackagesPromos,
  type PublicPackage,
} from '../../features/public/api/publicCatalog.api';
import type {
  Promo,
  PromoBranchScope,
} from '../../features/maintenance/maintenance.types';
import { getPromoTiming } from '../../features/maintenance/utils/promoTiming';
import styles from './PackagesPromosPage.module.css';

const BRANCH_SCOPE_LABELS: Record<PromoBranchScope, string> = {
  makati: 'Makati',
  southwoods: 'Southwoods',
  both: 'Both branches',
};

function formatCurrency(amount: number): string {
  return `PHP ${amount.toFixed(2)}`;
}

function formatPromoValue(promo: Promo): string {
  return promo.discount_type === 'Percentage'
    ? `${promo.value}% off`
    : `${formatCurrency(promo.value)} off`;
}

function formatPromoWindow(promo: Promo): string {
  if (promo.condition_note) return promo.condition_note;
  if (promo.start_date && promo.end_date) {
    return `${promo.start_date} to ${promo.end_date}`;
  }
  if (promo.end_date) return `Ends ${promo.end_date}`;
  return 'No expiry';
}

function formatPromoScope(promo: Promo): string {
  return promo.scope_type === 'all_services'
    ? 'Applies to all services'
    : 'Applies to specific services/packages';
}

type LoadStatus = 'loading' | 'error' | 'ready';

export function PackagesPromosPage() {
  const [packages, setPackages] = useState<PublicPackage[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchPublicPackagesPromos().then((result) => {
      if (cancelled) return;

      if (result.error || !result.data) {
        setError(
          result.error ??
            'Failed to load packages and promos. Please try again.'
        );
        setStatus('error');
        return;
      }

      setPackages(result.data.packages);
      setPromos(result.data.promos);
      setStatus('ready');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <LandingNavbar />
      <main className={styles.page}>
        <h1 className={styles.title}>Packages &amp; Promos</h1>
        <p className={styles.copy}>
          Bundled service packages and active promos from our branches, updated
          live by our team.
        </p>

        {status === 'loading' && (
          <p className={styles.status}>Loading packages and promos…</p>
        )}

        {status === 'error' && <p className={styles.statusError}>{error}</p>}

        {status === 'ready' && (
          <>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Packages</h2>
              {packages.length === 0 ? (
                <p className={styles.copy}>No packages available right now.</p>
              ) : (
                <div className={styles.grid}>
                  {packages.map((pkg) => (
                    <details key={pkg.id} className={styles.card}>
                      <summary className={styles.cardSummary}>
                        <span className={styles.cardTitle}>{pkg.name}</span>
                        <span className={styles.cardMeta}>
                          {pkg.branch_name} · {pkg.included_services.length}{' '}
                          service
                          {pkg.included_services.length === 1 ? '' : 's'}
                        </span>
                        <span className={styles.cardPrice}>
                          {formatCurrency(pkg.bundled_price)}
                        </span>
                      </summary>

                      <div className={styles.cardDetails}>
                        {pkg.included_services.length === 0 ? (
                          <p className={styles.cardMeta}>
                            No services listed for this package yet.
                          </p>
                        ) : (
                          <ul className={styles.serviceList}>
                            {pkg.included_services.map((service) => (
                              <li
                                key={service.id}
                                className={styles.serviceItem}
                              >
                                <span>{service.name}</span>
                                <span>
                                  {formatCurrency(service.base_price)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {pkg.savings > 0 && (
                          <p className={styles.savings}>
                            Booked separately:{' '}
                            {formatCurrency(pkg.individual_total_price)} — you
                            save {formatCurrency(pkg.savings)}
                          </p>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Promos</h2>
              {promos.length === 0 ? (
                <p className={styles.copy}>No active promos right now.</p>
              ) : (
                <div className={styles.grid}>
                  {promos.map((promo) => (
                    <article key={promo.id} className={styles.card}>
                      <h3 className={styles.cardTitle}>{promo.name}</h3>
                      <p className={styles.cardMeta}>
                        {BRANCH_SCOPE_LABELS[promo.branch_scope]} ·{' '}
                        {getPromoTiming(promo)}
                      </p>
                      <p className={styles.cardPrice}>
                        {formatPromoValue(promo)}
                      </p>
                      <p className={styles.cardMeta}>
                        {formatPromoWindow(promo)}
                      </p>
                      <p className={styles.cardMeta}>
                        {formatPromoScope(promo)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <Link to="/" className={styles.link}>
          Back to home
        </Link>
      </main>

      <HelpMascot
        links={[
          { label: 'Create an account', href: '#' },
          { label: 'Create a ticket', href: '#' },
        ]}
      />
    </>
  );
}
