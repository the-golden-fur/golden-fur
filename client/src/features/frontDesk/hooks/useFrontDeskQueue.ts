import { useCallback, useEffect, useState } from 'react';
import { listFrontDeskQueue } from '../api/frontDesk.api';
import type { FrontDeskQueueRow } from '../frontDesk.types';

const REFRESH_INTERVAL_MS = 15_000;

/** Pass enabled=false until the viewer's role is known. */
export function useFrontDeskQueue(
  accessToken: string | null,
  branchId: string | undefined,
  enabled: boolean
) {
  const [rows, setRows] = useState<FrontDeskQueueRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!enabled || !accessToken) return;
    const token = accessToken;
    let isMounted = true;

    function load() {
      void listFrontDeskQueue(token, branchId).then((result) => {
        if (!isMounted) return;
        setIsLoading(false);
        setError(result.error);
        if (result.data) setRows(result.data);
      });
    }

    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [accessToken, branchId, enabled, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  return { rows, isLoading, error, refresh };
}
