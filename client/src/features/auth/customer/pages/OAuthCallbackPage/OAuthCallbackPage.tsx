import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../../providers/AuthProvider/useAuth';
import { AccountMergeNotice } from '../../components/notices/AccountMergeNotice/AccountMergeNotice';
import { handleOAuthCallback } from '../../api/customerAuth.api';

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { applySession } = useAuth();
  const [merged, setMerged] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const runCallback = async () => {
      const result = await handleOAuthCallback();

      if (!result.error) {
        const wasMerged = result.data?.merged ?? false;
        setMerged(wasMerged);
        await applySession('demo-access-token', 'demo-refresh-token');

        if (!wasMerged) {
          navigate('/portal', { replace: true });
        }
      }

      setIsLoading(false);
    };

    void runCallback();
  }, [navigate, applySession]);

  if (isLoading) {
    return <p role="status">Completing sign in…</p>;
  }

  return merged ? <AccountMergeNotice /> : null;
}
