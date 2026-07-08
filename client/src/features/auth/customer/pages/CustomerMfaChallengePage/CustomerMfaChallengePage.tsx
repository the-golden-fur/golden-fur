import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../../../../shared/auth/providers/AuthProvider/useAuth';
import { TotpChallengeForm } from '../../../../../shared/components/TotpChallengeForm/TotpChallengeForm';
import styles from './CustomerMfaChallengePage.module.css';

export function CustomerMfaChallengePage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="customer-mfa-challenge-title">
        <div>
          <h1 className={styles.title} id="customer-mfa-challenge-title">
            Verify your identity
          </h1>
          <p className={styles.copy}>
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>
        <TotpChallengeForm
          role="customer"
          accessToken={accessToken}
          onVerified={() => {
            window.sessionStorage.removeItem('customerMfaPending');
            navigate('/portal', { replace: true });
          }}
        />
      </section>
    </main>
  );
}
