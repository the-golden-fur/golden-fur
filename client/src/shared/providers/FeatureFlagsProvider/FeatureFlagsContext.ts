import { createContext, useContext } from 'react';
import {
  ALL_FEATURES_OFF,
  type FeatureFlagKey,
  type FeatureFlags,
} from '../../api/featureFlags.api';

export interface FeatureFlagsContextValue {
  flags: FeatureFlags;
  /** False until the first read settles (success or failure) - a page that
   * redirects away from an off feature waits for this, so a feature that's
   * actually on isn't bounced during the first load. */
  isLoaded: boolean;
  /** Re-reads the switches - Settings > Experimental calls this after a
   * toggle so the rest of the app follows straight away. */
  refreshFeatureFlags: () => Promise<void>;
  /** Applies a known new set immediately (e.g. the PATCH response). */
  setFlags: (flags: FeatureFlags) => void;
}

export const FeatureFlagsContext =
  createContext<FeatureFlagsContextValue | null>(null);

const NO_PROVIDER: FeatureFlagsContextValue = {
  flags: ALL_FEATURES_OFF,
  isLoaded: true,
  refreshFeatureFlags: async () => {},
  setFlags: () => {},
};

/** Unlike useToast, this doesn't throw outside a provider: an experimental
 * feature is simply off there (a component rendered on its own, a test). */
export function useFeatureFlags(): FeatureFlagsContextValue {
  return useContext(FeatureFlagsContext) ?? NO_PROVIDER;
}

/** `const spinWheelOn = useFeatureFlag('spin_wheel');` */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  return useFeatureFlags().flags[key];
}
