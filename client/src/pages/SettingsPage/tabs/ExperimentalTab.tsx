import { useState } from 'react';
import { ToggleSwitch } from '../../../shared/components/ToggleSwitch/ToggleSwitch';
import {
  setFeatureFlag,
  type FeatureFlagKey,
} from '../../../shared/api/featureFlags.api';
import { useFeatureFlags } from '../../../shared/providers/FeatureFlagsProvider/FeatureFlagsContext';
import settingsStyles from '../SettingsPage.module.css';
import styles from './ExperimentalTab.module.css';

interface ExperimentalFeature {
  key: FeatureFlagKey;
  title: string;
  description: string;
}

/** Every switch shown here - add a row when a new experimental feature
 * gets a key (featureFlags.api.ts / the server's featureFlags.types.ts). */
const FEATURES: ExperimentalFeature[] = [
  {
    key: 'spin_wheel',
    title: 'Coupon spin wheel',
    description:
      'Spins, the prize wheel, reward pools and reward coupons for customers.',
  },
];

interface ExperimentalTabProps {
  accessToken: string;
}

/**
 * Settings > Experimental (Superadmin only). Archived features stay off -
 * hidden from every customer and staff screen - until switched on here.
 * Turning one off never deletes data: earned spins and won coupons are only
 * paused, and come back as they were when it's switched on again.
 */
export function ExperimentalTab({ accessToken }: ExperimentalTabProps) {
  const { flags, setFlags } = useFeatureFlags();
  const [savingKey, setSavingKey] = useState<FeatureFlagKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (key: FeatureFlagKey, enabled: boolean) => {
    const previous = flags;
    setError(null);
    setSavingKey(key);
    // Optimistic - the switch moves right away, and goes back if it fails.
    setFlags({ ...flags, [key]: enabled });

    const result = await setFeatureFlag(accessToken, key, enabled);

    setSavingKey(null);
    if (result.error || !result.data) {
      setFlags(previous);
      setError(result.error ?? 'Could not save the change.');
      return;
    }

    setFlags(result.data);
  };

  return (
    <section className={settingsStyles.panel}>
      <div className={styles.header}>
        <h2 className={settingsStyles.sectionTitle}>Experimental features</h2>
        <p className={settingsStyles.copy}>
          Features that are archived or still being tried out. Switching one off
          hides it everywhere but keeps its data, so switching it back on
          restores everything as it was.
        </p>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <ul className={styles.list}>
        {FEATURES.map((feature) => (
          <li key={feature.key} className={styles.row}>
            <div className={styles.text}>
              <span className={styles.title}>{feature.title}</span>
              <span className={styles.description}>{feature.description}</span>
            </div>
            <ToggleSwitch
              checked={flags[feature.key]}
              disabled={savingKey === feature.key}
              label={feature.title}
              hideLabel
              onChange={(enabled) => void handleToggle(feature.key, enabled)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
