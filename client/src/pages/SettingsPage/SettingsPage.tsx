import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '../../shared/auth/providers/AuthProvider/useAuth';
import { getMfaStatus } from '../../shared/api/mfa.api';
import type { ThemeRole } from '../../shared/providers/ThemeProvider/themeContext';
import type { MfaStatusResponse } from '../../shared/auth/mfa.types';
import { ProfileTab } from './tabs/ProfileTab';
import { AppearanceTab } from './tabs/AppearanceTab';
import { AccountTab } from './tabs/AccountTab';
import { SecurityTab } from './tabs/SecurityTab';
import { ConfigTab } from './tabs/ConfigTab';
import styles from './SettingsPage.module.css';

interface SettingsPageProps {
  role: ThemeRole;
}

type SettingsTab = 'profile' | 'appearance' | 'account' | 'security' | 'config';

const TAB_LABELS: Record<SettingsTab, string> = {
  profile: 'Profile',
  appearance: 'Appearance',
  account: 'Account',
  security: 'Security',
  config: 'Config',
};

function isSettingsTab(
  value: string | null,
  tabs: SettingsTab[]
): value is SettingsTab {
  return Boolean(value) && tabs.includes(value as SettingsTab);
}

/**
 * Settings shell: Profile / Account / Security / Config (Admin/Superadmin
 * only). Replaces the previous MFA-only page - Security below is that page's
 * original body, unchanged. `status` (from getMfaStatus, which already
 * returns the viewer's staff role) stays fetched here rather than per-tab
 * since it gates both the Config tab's visibility and reflects account-wide
 * state Security itself needs to render.
 */
export function SettingsPage({ role }: SettingsPageProps) {
  const { user, accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<MfaStatusResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let isMounted = true;

    void getMfaStatus(role, accessToken).then((result) => {
      if (isMounted && result.data) {
        setStatus(result.data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [role, accessToken, refreshKey]);

  const isAdmin =
    role === 'staff' &&
    (status?.role === 'Admin' || status?.role === 'Superadmin');

  const tabs: SettingsTab[] = isAdmin
    ? ['profile', 'appearance', 'account', 'security', 'config']
    : ['profile', 'appearance', 'account', 'security'];

  const activeTab = isSettingsTab(searchParams.get('tab'), tabs)
    ? (searchParams.get('tab') as SettingsTab)
    : 'profile';

  const setActiveTab = (tab: SettingsTab) => {
    setSearchParams(tab === 'profile' ? {} : { tab });
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load your settings.
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Settings</h1>
      <div
        className={styles.tabList}
        role="tablist"
        aria-label="Settings sections"
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={
              activeTab === tab
                ? `${styles.tab} ${styles.tabActive}`
                : styles.tab
            }
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'profile' ? (
        <ProfileTab role={role} userId={user.id} accessToken={accessToken} />
      ) : null}
      {activeTab === 'appearance' ? <AppearanceTab /> : null}
      {activeTab === 'account' ? (
        <AccountTab role={role} userId={user.id} accessToken={accessToken} />
      ) : null}
      {activeTab === 'security' ? (
        <SecurityTab
          role={role}
          accessToken={accessToken}
          status={status}
          onChanged={() => setRefreshKey((key) => key + 1)}
        />
      ) : null}
      {activeTab === 'config' && isAdmin ? (
        <ConfigTab isSuperadmin={status?.role === 'Superadmin'} />
      ) : null}
    </main>
  );
}
