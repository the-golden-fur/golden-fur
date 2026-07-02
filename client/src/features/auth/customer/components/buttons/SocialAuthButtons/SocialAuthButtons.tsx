import { FacebookOAuthButton } from '../FacebookOAuthButton/FacebookOAuthButton';
import { GoogleOAuthButton } from '../GoogleOAuthButton/GoogleOAuthButton';
import styles from './SocialAuthButtons.module.css';

export function SocialAuthButtons() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.divider}>or continue with</div>
      <div className={styles.buttonRow}>
        <GoogleOAuthButton className={styles.oauthButton} />
        <FacebookOAuthButton className={styles.oauthButton} />
      </div>
    </div>
  );
}
