import { useState } from 'react';
import { AdminPromoConfigPage } from '../AdminPromoConfigPage/AdminPromoConfigPage';
import { AdminRewardsPage } from '../../../rewards/pages/AdminRewardsPage/AdminRewardsPage';
import { AdminRewardPoolsPage } from '../../../rewards/pages/AdminRewardPoolsPage/AdminRewardPoolsPage';
import styles from './AdminPromosAndRewardsPage.module.css';

type Section = 'promos' | 'rewards' | 'reward-pools';

const SECTIONS: Section[] = ['promos', 'rewards', 'reward-pools'];

const SECTION_LABELS: Record<Section, string> = {
  promos: 'Promos',
  rewards: 'Rewards',
  'reward-pools': 'Reward Pools',
};

/**
 * One Settings > Config entry ("Promos & Rewards"), same
 * mini-navbar-subtabs shape as AdminServicesAndPackagesPage - each section
 * renders its own page component unmodified (own role gating, fetching, and
 * forms), this is purely a navigation/entry-point consolidation.
 *
 * Session 114: the old "Coupon Spin Wheel" tab is gone - a spin wheel is
 * now a promo TYPE (Promos > New promo > Coupon spin wheel, with its
 * trigger conditions, reward pool, and pity), and its catalog is split into
 * Rewards (every reward a wheel can land on) and Reward Pools (named sets
 * of rewards a spin-wheel promo draws from).
 *
 * Deliberately plain useState, not useSearchParams (AdminServicesAndPackagesPage's
 * own choice) - SettingsPage.tsx's own doc comment explains why: any
 * setSearchParams()/navigate() call anywhere in an embedded tree silently
 * wipes Settings' own tab/tile selection, since both read the same URL
 * search params. AdminServicesAndPackagesPage predates that finding and
 * hasn't hit it in practice, but there's no reason for a new page to take
 * on the same risk.
 */
export function AdminPromosAndRewardsPage() {
  const [activeSection, setActiveSection] = useState<Section>('promos');

  return (
    <main className={styles.page}>
      <div
        className={styles.tabList}
        role="tablist"
        aria-label="Promos and Rewards sections"
      >
        {SECTIONS.map((section) => (
          <button
            key={section}
            type="button"
            role="tab"
            aria-selected={activeSection === section}
            className={
              activeSection === section
                ? `${styles.tab} ${styles.tabActive}`
                : styles.tab
            }
            onClick={() => setActiveSection(section)}
          >
            {SECTION_LABELS[section]}
          </button>
        ))}
      </div>

      {activeSection === 'promos' ? <AdminPromoConfigPage /> : null}
      {activeSection === 'rewards' ? <AdminRewardsPage /> : null}
      {activeSection === 'reward-pools' ? <AdminRewardPoolsPage /> : null}
    </main>
  );
}
