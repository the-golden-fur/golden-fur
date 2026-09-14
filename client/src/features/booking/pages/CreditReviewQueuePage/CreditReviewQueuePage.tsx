import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  getCustomerProfile,
  getPet,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import {
  decideCreditReview,
  listPendingCreditReviews,
} from '../../api/booking.api';
import { BOOKING_MARK_PAID_ROLES } from '../../booking.types';
import type { CreditReviewQueueItem } from '../../booking.types';
import { CreditReviewCard } from '../../components/CreditReviewCard/CreditReviewCard';
import styles from './CreditReviewQueuePage.module.css';

/**
 * Manual-cancellation-credit-review custom change: a Manual-mode branch's
 * cancellation_logs rows still awaiting a staff decision on whether the
 * downpayment is returned as account credit. Role-gated the same way the
 * server route is (BOOKING_MARK_PAID_ROLES) - this is a money decision, not
 * a general staff task. Branch scoping happens entirely server-side
 * (Superadmin sees every branch, everyone else only their own) - see
 * listPendingCreditReviewsController.
 */
export function CreditReviewQueuePage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [items, setItems] = useState<CreditReviewQueueItem[]>([]);
  const [pets, setPets] = useState<Record<string, Pet>>({});
  const [owners, setOwners] = useState<Record<string, CustomerProfile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingLogId, setSubmittingLogId] = useState<string | null>(null);

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
    viewerRole !== null && BOOKING_MARK_PAID_ROLES.includes(viewerRole);

  const loadQueue = (token: string) => {
    void listPendingCreditReviews(token).then((result) => {
      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load the credit review queue.');
        return;
      }

      setLoadError(null);
      setItems(result.data);

      const petIds = new Set(result.data.map((item) => item.booking.pet_id));
      const customerIds = new Set(
        result.data.map((item) => item.booking.customer_id)
      );

      void Promise.all(Array.from(petIds).map((id) => getPet(id, token))).then(
        (petResults) => {
          setPets((prev) => {
            const next = { ...prev };
            for (const petResult of petResults) {
              if (petResult.data) next[petResult.data.id] = petResult.data;
            }
            return next;
          });
        }
      );

      void Promise.all(
        Array.from(customerIds).map((id) => getCustomerProfile(id, token))
      ).then((ownerResults) => {
        setOwners((prev) => {
          const next = { ...prev };
          for (const ownerResult of ownerResults) {
            if (ownerResult.data) next[ownerResult.data.id] = ownerResult.data;
          }
          return next;
        });
      });
    });
  };

  useEffect(() => {
    if (isAllowedViewer && accessToken) {
      loadQueue(accessToken);
    }
  }, [isAllowedViewer, accessToken]);

  function handleDecision(logId: string, decision: 'approved' | 'denied') {
    if (!accessToken) return;

    setActionError(null);
    setSubmittingLogId(logId);

    void decideCreditReview(logId, accessToken, decision).then((result) => {
      setSubmittingLogId(null);

      if (result.error) {
        setActionError(result.error);
        return;
      }

      setItems((prev) => prev.filter((item) => item.log.id !== logId));
    });
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load the credit review queue.
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

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Credit Review Queue</h1>
        <p className={styles.copy}>
          Cancellations from a Manual-review branch, still waiting on a decision
          - approve to return the down payment as account credit, deny to keep
          it forfeited.
        </p>

        {actionError ? (
          <p className={styles.errorBanner} role="alert">
            {actionError}
          </p>
        ) : null}

        {isLoading ? (
          <p className={styles.copy}>Loading pending reviews...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : items.length === 0 ? (
          <p className={styles.copy}>No cancellations awaiting review.</p>
        ) : (
          <div className={styles.grid}>
            {items.map((item) => (
              <CreditReviewCard
                key={item.log.id}
                item={item}
                petName={pets[item.booking.pet_id]?.name ?? 'Unknown pet'}
                ownerName={
                  owners[item.booking.customer_id]?.full_name ?? 'Unknown owner'
                }
                isSubmitting={submittingLogId === item.log.id}
                onApprove={() => handleDecision(item.log.id, 'approved')}
                onDeny={() => handleDecision(item.log.id, 'denied')}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
