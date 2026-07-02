import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../providers/AuthProvider/useAuth';
import { handleOAuthCallback } from '../../api/customerAuth.api';
import { AccountMergeNotice } from '../../components/notices/AccountMergeNotice/AccountMergeNotice';

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
    return <p role="status">Completing sign in…</p>;
  }

  if (error) {
    return <p role="alert">Sign in failed: {error}</p>;
  }

  return merged ? <AccountMergeNotice /> : null;
}
