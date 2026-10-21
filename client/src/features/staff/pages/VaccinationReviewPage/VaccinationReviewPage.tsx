import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { listPendingVaccinationRecords } from '../../../customers/api/customer.api';
import type { PendingVaccinationRecord } from '../../../customers/customer.types';
import { VaccinationReviewActions } from '../../../customers/components/VaccinationReviewActions/VaccinationReviewActions';
import { listStaff } from '../../api/staff.api';
import styles from './VaccinationReviewPage.module.css';

/** Same list as the server's VACCINATION_MANAGER_ROLES
 * (vaccinationRecord.service.ts), which enforces it again. */
const ALLOWED_VIEWER_ROLES = new Set([
  'Receptionist',
  'Front Desk',
  'Veterinarian',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

function formatSubmitted(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Customer-reported vaccinations waiting for staff: each with the pet,
 * owner, vaccine and the card photo to check it against, oldest first.
 * Verify or Reject (with a reason) and the record leaves the queue; the
 * owner is notified. Clinic-wide, since pets belong to no branch.
 * Information only - nothing in booking waits on these.
 */
export function VaccinationReviewPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [records, setRecords] = useState<PendingVaccinationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

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
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;

    void listPendingVaccinationRecords(accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);
      setError(result.error);
      if (result.data) setRecords(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  if (isRoleLoading) {
    return <LoadingState />;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Vaccination Review</h1>
        <p className={styles.subtitle}>
          Vaccinations owners added themselves. Check each against its card,
          then verify or reject it. The owner is told either way.
        </p>
      </header>

      {message ? <p className={styles.successBanner}>{message}</p> : null}

      {isLoading ? (
        <LoadingState label="Loading vaccinations to review..." />
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : records.length === 0 ? (
        <p className={styles.empty}>Nothing to review right now.</p>
      ) : (
        <ul className={styles.list}>
          {records.map((record) => (
            <li key={record.id} className={styles.item}>
              {record.proof_url ? (
                <a
                  className={styles.cardLink}
                  href={record.proof_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open the vaccination card for ${record.pet_name ?? 'this pet'}`}
                >
                  <img
                    className={styles.cardImage}
                    src={record.proof_url}
                    alt=""
                    // A PDF card has no image preview - the link still opens it.
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                  <span className={styles.cardLinkLabel}>Open card</span>
                </a>
              ) : (
                <span className={styles.noCard}>No card attached</span>
              )}

              <div className={styles.details}>
                <p className={styles.vaccine}>{record.vaccine_name}</p>
                <p className={styles.meta}>
                  <Link
                    className={styles.petLink}
                    to={`/staff/pets/${record.pet_id}`}
                  >
                    {record.pet_name ?? 'Unknown pet'}
                  </Link>
                  {' · '}
                  {record.owner_name ?? 'Unknown owner'}
                </p>
                <dl className={styles.facts}>
                  <div>
                    <dt>Given</dt>
                    <dd>{record.date_administered}</dd>
                  </div>
                  <div>
                    <dt>Next due</dt>
                    <dd>{record.next_due_date ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Added</dt>
                    <dd>{formatSubmitted(record.created_at)}</dd>
                  </div>
                </dl>
                {record.notes ? (
                  <p className={styles.notes}>{record.notes}</p>
                ) : null}

                <VaccinationReviewActions
                  petId={record.pet_id}
                  record={record}
                  accessToken={accessToken}
                  onReviewed={(reviewed) => {
                    setRecords((prev) =>
                      prev.filter((item) => item.id !== reviewed.id)
                    );
                    setMessage(
                      `${record.pet_name ?? 'The pet'}'s ${reviewed.vaccine_name} ${
                        reviewed.status === 'verified' ? 'verified' : 'rejected'
                      }. The owner has been notified.`
                    );
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
