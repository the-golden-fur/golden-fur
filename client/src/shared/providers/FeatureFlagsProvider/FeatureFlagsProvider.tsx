import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ALL_FEATURES_OFF,
  getFeatureFlags,
  type FeatureFlags,
} from '../../api/featureFlags.api';
import { FeatureFlagsContext } from './FeatureFlagsContext';

/**
 * Mounted once at the app root (App.tsx). Reads the experimental feature
 * switches once on load; until (or unless) that succeeds every feature reads
 * as off - an archived feature stays hidden rather than flashing on.
 */
export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(ALL_FEATURES_OFF);
  const [isLoaded, setIsLoaded] = useState(false);

  const refreshFeatureFlags = useCallback(async () => {
    const result = await getFeatureFlags();
    if (result.data) setFlags(result.data);
  }, []);

  useEffect(() => {
    let isMounted = true;

    void getFeatureFlags().then((result) => {
      if (!isMounted) return;
      if (result.data) setFlags(result.data);
      setIsLoaded(true);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const value = useMemo(
    () => ({ flags, isLoaded, refreshFeatureFlags, setFlags }),
    [flags, isLoaded, refreshFeatureFlags]
  );

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}
