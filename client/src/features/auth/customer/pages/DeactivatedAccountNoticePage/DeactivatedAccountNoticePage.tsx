import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../../../../shared/auth/providers/AuthProvider/useAuth';
import { AuthCard } from '../../../../../shared/components/AuthCard/AuthCard';
import {
  activateCustomer,
  getOwnCustomerAccountStatus,
} from '../../../../customers/api/customer.api';
import styles from './DeactivatedAccountNoticePage.module.css';

/**
 * Reached from CustomerLoginForm (a fresh login for a deactivated account
 * still succeeds - see customerLoginController's account_status field) and
 * from CustomerAuthGuard (a session that was already live when deactivation
 * happened elsewhere - another device, or staff-initiated). Requires a
 * session: it's the account that's deactivated, not the browser
 * unauthenticated, and REACTIVATE needs that session to call the
 * self-service activate endpoint without a second login.
 */
export function DeactivatedAccountNoticePage() {
  const { user, accessToken, signOut } = useAuth();
  const navigate = useNavigate();
  const [autoDeleteDays, setAutoDeleteDays] = useState<number | null>(null);
  const [isPermanentlyDeleted, setIsPermanentlyDeleted] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !accessToken) return;

    let isMounted = true;

    void getOwnCustomerAccountStatus(user.id, accessToken).then((result) => {
      if (!isMounted || !result.data) return;
      setAutoDeleteDays(result.data.auto_delete_policy_days);
      setIsPermanentlyDeleted(Boolean(result.data.customer.anonymized_at));
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, accessToken]);

  const handleLogInToOtherAccount = () => {
    void signOut().finally(() => {
      navigate('/login', { replace: true });
    });
  };

  const handleReactivate = async () => {
    if (!user?.id || !accessToken) return;

    setIsReactivating(true);
    setError(null);

    const result = await activateCustomer(user.id, accessToken);

    if (result.error) {
      setIsReactivating(false);
      setError(result.error);
      return;
    }

    navigate('/portal', { replace: true });
  };

  if (!user || !accessToken) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AuthCard
      titleId="account-deactivated-title"
      title="This account has been deactivated"
    >
      {isPermanentlyDeleted ? (
        <p className={styles.copy}>
          This account has already been permanently deleted and can't be
          reactivated.
        </p>
      ) : (
        <p className={styles.copy}>
          It will be automatically deleted after{' '}
          {autoDeleteDays ?? 'a number of'} days if you don't log back in to
          reactivate it.
        </p>
      )}
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        {!isPermanentlyDeleted ? (
          <button
            className={styles.primaryButton}
            type="button"
            disabled={isReactivating}
            onClick={() => void handleReactivate()}
          >
            {isReactivating ? 'Reactivating...' : 'Reactivate'}
          </button>
        ) : null}
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={handleLogInToOtherAccount}
        >
          Log in to other account
        </button>
      </div>
    </AuthCard>
  );
}
