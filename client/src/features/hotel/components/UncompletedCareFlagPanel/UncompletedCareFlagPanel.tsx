import { useEffect, useState } from 'react';
import { getFlaggedCareLogEntries } from '../../api/hotel.api';
import type { CareLogEntry } from '../../hotel.types';
import styles from './UncompletedCareFlagPanel.module.css';

interface UncompletedCareFlagPanelProps {
  accessToken: string;
}

/**
 * Issue #80: highlights end-of-day uncompleted care log entries on the
 * supervisor/admin branch dashboard (AC-3) - scoped to the viewer's own
 * branch server-side (Superadmin sees both, per careLogFlagging.service.ts).
 * Reuses Sprint 3's --color-followup-indicator-* tokens rather than a new
 * color (AC-4), since both represent "attention-worthy, unresolved".
 */
export function UncompletedCareFlagPanel({
  accessToken,
}: UncompletedCareFlagPanelProps) {
  const [entries, setEntries] = useState<CareLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void getFlaggedCareLogEntries(accessToken).then((result) => {
      setIsLoading(false);
      if (result.data) setEntries(result.data);
    });
  }, [accessToken]);

  if (isLoading) {
    return (
      <p className={styles.copy}>Checking for uncompleted care actions...</p>
    );
  }

  if (entries.length === 0) {
    return <p className={styles.copy}>No uncompleted care actions flagged.</p>;
  }

  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Uncompleted care actions</h3>
      <ul className={styles.list}>
        {entries.map((entry) => (
          <li key={entry.id} className={styles.flag}>
            {entry.description} - scheduled {entry.scheduled_date}
          </li>
        ))}
      </ul>
    </div>
  );
}
