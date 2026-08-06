import { ThemeToggle } from '../../../shared/components/ThemeToggle/ThemeToggle';
import { FontSizeSlider } from '../../../shared/components/FontSizeSlider/FontSizeSlider';
import type { ThemeRole } from '../../../shared/providers/ThemeProvider/themeContext';
import { NotificationPreferencesGrid } from './NotificationPreferencesGrid';
import styles from '../SettingsPage.module.css';

interface PreferencesTabProps {
  role: ThemeRole;
  userId: string;
  accessToken: string;
}

/**
 * Settings > Preferences: appearance (color theme, font size) and, per
 * notification event type, which channels (email, in-browser) deliver it.
 * Theme/font size persist per-account via ThemeProvider/preferences.api and
 * apply instantly; the notification grid below persists the same way (no
 * save button) but through its own dedicated endpoint, since a single event
 * type + channel toggle merges into the stored preference map rather than
 * replacing it wholesale.
 */
export function PreferencesTab({
  role,
  userId,
  accessToken,
}: PreferencesTabProps) {
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
      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>Notifications</h2>
        <p className={styles.copy}>
          Choose how you want to hear about each kind of activity.
        </p>
        <NotificationPreferencesGrid
          role={role}
          userId={userId}
          accessToken={accessToken}
        />
      </section>
    </>
  );
}
