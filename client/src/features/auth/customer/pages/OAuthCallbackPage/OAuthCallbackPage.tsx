import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../providers/AuthProvider/useAuth';
import { handleOAuthCallback } from '../../api/customerAuth.api';
import { AccountMergeNotice } from '../../components/notices/AccountMergeNotice/AccountMergeNotice';
import styles from './OAuthCallbackPage.module.css';

const MERGE_NOTICE_DURATION_MS = 3000;

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [merged, setMerged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) {
      return;
    }
    hasRun.current = true;

    const runCallback = async () => {
      const result = await handleOAuthCallback();

      if (result.error || !result.data) {
        setError(result.error ?? 'OAuth callback failed');
        setIsLoading(false);
        return;
      }

      setMerged(result.data.merged);
      await applySession(result.data.access_token, result.data.refresh_token);
      setIsLoading(false);

      if (result.data.merged) {
        setTimeout(() => {
          navigate('/portal', { replace: true });
        }, MERGE_NOTICE_DURATION_MS);
      } else {
        navigate('/portal', { replace: true });
      }
    };

    void runCallback();
  }, [navigate, applySession]);

  if (isLoading) {
    return (
      <main className={styles.page}>
        <p className={styles.status} role="status">
          Completing sign in…
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className={styles.page}>
        <p className={styles.error} role="alert">
          Sign in failed: {error}
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>{merged ? <AccountMergeNotice /> : null}</main>
  );
}
