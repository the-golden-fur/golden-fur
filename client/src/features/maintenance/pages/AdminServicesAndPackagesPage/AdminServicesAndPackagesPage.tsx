import { useSearchParams } from 'react-router';
import { AdminServicesPage } from '../AdminServicesPage/AdminServicesPage';
import { AdminServiceTypesPage } from '../AdminServiceTypesPage/AdminServiceTypesPage';
import { AdminPackageBuilderPage } from '../AdminPackageBuilderPage/AdminPackageBuilderPage';
import styles from './AdminServicesAndPackagesPage.module.css';

type Section = 'services' | 'service-types' | 'packages';

const SECTIONS: Section[] = ['services', 'service-types', 'packages'];

const SECTION_LABELS: Record<Section, string> = {
  services: 'Services',
  'service-types': 'Service Types',
  packages: 'Packages',
};

function isSection(value: string | null): value is Section {
  return Boolean(value) && SECTIONS.includes(value as Section);
}

/**
 * Custom change: combines the three previously-separate admin pages
 * (Services, Service Types, Packages) into one Settings > Config entry,
 * same tab-bar-over-searchParams pattern as SettingsPage itself - each
 * section renders the existing page component unmodified (own role gating,
 * fetching, and forms untouched), this is purely a navigation/entry-point
 * consolidation.
 */
export function AdminServicesAndPackagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeSection = isSection(searchParams.get('section'))
    ? (searchParams.get('section') as Section)
    : 'services';

  const setActiveSection = (section: Section) => {
    setSearchParams(section === 'services' ? {} : { section });
  };

  return (
    <main className={styles.page}>
      <div
        className={styles.tabList}
        role="tablist"
        aria-label="Services and Packages sections"
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

      {activeSection === 'services' ? <AdminServicesPage /> : null}
      {activeSection === 'service-types' ? <AdminServiceTypesPage /> : null}
      {activeSection === 'packages' ? <AdminPackageBuilderPage /> : null}
    </main>
  );
}
