import { ThemeToggle } from '../../../shared/components/ThemeToggle/ThemeToggle';
import { FontSizeSlider } from '../../../shared/components/FontSizeSlider/FontSizeSlider';
import styles from '../SettingsPage.module.css';

/**
 * Settings > Appearance: color theme (device default / light / dark) and
 * font size. Both persist per-account (ThemeProvider/preferences.api) and
 * apply instantly - no save button needed, same as the theme toggle already
 * behaved before this tab existed to hold it.
 */
export function AppearanceTab() {
  return (
    <>
      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Theme</h2>
        <p className={styles.copy}>
          Device default follows your system's light/dark setting automatically.
        </p>
        <ThemeToggle />
      </section>
      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Font size</h2>
        <FontSizeSlider />
      </section>
    </>
  );
}
