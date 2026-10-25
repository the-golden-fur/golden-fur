import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { FeatureFlagKey } from '../../api/featureFlags.api';
import { useFeatureFlags } from '../../providers/FeatureFlagsProvider/FeatureFlagsContext';

interface FeatureGateProps {
  feature: FeatureFlagKey;
  /** Where a visitor lands while the feature is switched off. */
  redirectTo: string;
  children: ReactNode;
}

/**
 * Route-level gate for an experimental feature (Settings > Experimental):
 * renders the page only while the feature is on, otherwise redirects. Waits
 * for the first flag read so a feature that's on isn't bounced on load.
 */
export function FeatureGate({
  feature,
  redirectTo,
  children,
}: FeatureGateProps) {
  const { flags, isLoaded } = useFeatureFlags();

  if (!isLoaded) return null;
  if (!flags[feature]) return <Navigate to={redirectTo} replace />;

  return <>{children}</>;
}
