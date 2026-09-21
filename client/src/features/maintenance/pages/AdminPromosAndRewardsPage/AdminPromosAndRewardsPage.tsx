import { useState } from 'react';
import { AdminPromoConfigPage } from '../AdminPromoConfigPage/AdminPromoConfigPage';
import { AdminSpinWheelConfigPage } from '../../../rewards/pages/AdminSpinWheelConfigPage/AdminSpinWheelConfigPage';
import styles from './AdminPromosAndRewardsPage.module.css';

type Section = 'promos' | 'spin-wheel';

const SECTIONS: Section[] = ['promos', 'spin-wheel'];

const SECTION_LABELS: Record<Section, string> = {
  promos: 'Promos',
  'spin-wheel': 'Coupon Spin Wheel',
};

/**
 * Combines the two previously-separate admin pages (Promos, Coupon Spin
 * Wheel) into one Settings > Config entry ("Promos & Rewards"), same
 * mini-navbar-subtabs shape as AdminServicesAndPackagesPage - each section
 * renders the existing page component unmodified (own role gating,
 * fetching, and forms untouched), this is purely a navigation/entry-point
 * consolidation.
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
      {activeSection === 'spin-wheel' ? <AdminSpinWheelConfigPage /> : null}
    </main>
  );
}
