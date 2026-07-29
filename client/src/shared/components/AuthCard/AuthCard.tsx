import type { ReactNode } from 'react';
import styles from './AuthCard.module.css';

interface AuthCardProps {
  titleId: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}

/**
 * Centered single-card auth layout, shared by every auth page that isn't
 * StaffLoginPage's two-column hero layout - MfaChallengePage, MfaEnrollPage,
 * StaffResetPasswordPage, CustomerMfaChallengePage. Previously each of these
 * either duplicated this exact page/card CSS block, or (MfaChallengePage,
 * MfaEnrollPage) borrowed StaffLoginPage.module.css and referenced classes
 * (`shell`/`title`/`copy`) that module never defined - the content rendered
 * with no layout at all, pinned to the top-left instead of centered.
 */
export function AuthCard({
  titleId,
  title,
  subtitle,
  children,
}: AuthCardProps) {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby={titleId}>
        <div>
          <h1 className={styles.title} id={titleId}>
            {title}
          </h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {children}
      </section>
    </main>
  );
}
