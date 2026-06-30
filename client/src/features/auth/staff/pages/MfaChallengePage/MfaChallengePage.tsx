import { MfaChallengeForm } from '../../components/forms/MfaChallengeForm/MfaChallengeForm';
import styles from '../StaffLoginPage/StaffLoginPage.module.css';

export function MfaChallengePage() {
  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="mfa-challenge-title">
        <div>
          <h1 className={styles.title} id="mfa-challenge-title">
            Verify MFA
          </h1>
          <p className={styles.copy}>
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>
        <MfaChallengeForm />
      </section>
    </main>
  );
}
