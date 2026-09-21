import { useState } from 'react';
import { AdminPetTypesPage } from '../AdminPetTypesPage/AdminPetTypesPage';
import { AdminBreedsPage } from '../AdminBreedsPage/AdminBreedsPage';
import styles from './AdminPetsPage.module.css';

type Section = 'pet-types' | 'breeds';

const SECTIONS: Section[] = ['pet-types', 'breeds'];

const SECTION_LABELS: Record<Section, string> = {
  'pet-types': 'Pet Types',
  breeds: 'Breeds',
};

/**
 * Combines the two previously-separate admin pages (Pet Types, Breed
 * Management) into one Settings > Config entry ("Pets"), same
 * mini-navbar-subtabs shape as AdminPromosAndRewardsPage - each section
 * renders the existing page component unmodified (own role gating,
 * fetching, forms, and PetTypePriceOverrideModal untouched), this is
 * purely a navigation/entry-point consolidation.
 *
 * Deliberately plain useState, not useSearchParams - see
 * AdminPromosAndRewardsPage's own doc comment for why: Settings' own
 * tab/tile selection lives in the same URL search params, so any
 * setSearchParams()/navigate() call anywhere in an embedded tree would
 * silently wipe it.
 */
export function AdminPetsPage() {
  const [activeSection, setActiveSection] = useState<Section>('pet-types');

  return (
    <main className={styles.page}>
      <div
        className={styles.tabList}
        role="tablist"
        aria-label="Pets sections"
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

      {activeSection === 'pet-types' ? <AdminPetTypesPage /> : null}
      {activeSection === 'breeds' ? <AdminBreedsPage /> : null}
    </main>
  );
}
