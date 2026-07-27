import { useEffect, useState } from 'react';
import {
  completeCareLogEntry,
  getTodayCareLogEntries,
} from '../../api/hotel.api';
import type { CareLogEntry } from '../../hotel.types';
import styles from './CareLogChecklist.module.css';

interface CareLogChecklistProps {
  accessToken: string;
}

/**
 * Issue #80: pet-assistant-facing daily checklist - read-only except for
 * the mark-complete action (AC-1), matching the RLS restriction already
 * enforced server-side (#74/#76) so the UI and the data agree. Updates
 * immediately on completion without a page reload (AC-2).
 */
export function CareLogChecklist({ accessToken }: CareLogChecklistProps) {
  const [entries, setEntries] = useState<CareLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  useEffect(() => {
    void getTodayCareLogEntries(accessToken).then((result) => {
      setIsLoading(false);
      if (result.data) {
        setEntries(result.data);
      } else {
        setError(result.error);
      }
    });
  }, [accessToken]);

  async function handleComplete(entryId: string) {
    setCompletingId(entryId);
    const result = await completeCareLogEntry(entryId, accessToken);
    setCompletingId(null);

    if (result.data) {
      setEntries((prev) =>
        prev.map((entry) => (entry.id === entryId ? result.data! : entry))
      );
    }
  }

  if (isLoading) {
    return <p className={styles.copy}>Loading today's care log...</p>;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  if (entries.length === 0) {
    return <p className={styles.copy}>No care actions scheduled for today.</p>;
  }

  return (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <li key={entry.id} className={styles.row}>
          <div>
            <p className={styles.description}>{entry.description}</p>
            <span className={styles.careType}>{entry.care_type}</span>
          </div>
          {entry.completed_at ? (
            <span className={styles.completedBadge}>
              Done by {entry.completed_by_staff?.display_name ?? 'staff'} at{' '}
              {new Date(entry.completed_at).toLocaleTimeString()}
            </span>
          ) : (
            <button
              type="button"
              className={styles.completeButton}
              disabled={completingId === entry.id}
              onClick={() => void handleComplete(entry.id)}
            >
              {completingId === entry.id ? 'Marking...' : 'Mark complete'}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
