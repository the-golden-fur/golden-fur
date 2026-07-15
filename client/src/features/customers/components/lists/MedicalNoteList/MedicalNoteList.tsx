import { useEffect, useState } from 'react';
import { listMedicalNotes } from '../../../api/customer.api';
import type { PetMedicalNote } from '../../../customer.types';
import styles from './MedicalNoteList.module.css';

interface MedicalNoteListProps {
  petId: string;
  accessToken: string;
}

/**
 * Read-only, and permanently so - Issue #33 exposes no update/delete route
 * for medical notes at all, so unlike VaccinationRecordList this list will
 * never grow edit affordances later.
 */
export function MedicalNoteList({ petId, accessToken }: MedicalNoteListProps) {
  const [notes, setNotes] = useState<PetMedicalNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void listMedicalNotes(petId, accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      setNotes(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [petId, accessToken]);

  if (isLoading) {
    return <p className={styles.copy}>Loading medical notes...</p>;
  }

  if (error) {
    return (
      <p className={styles.errorBanner} role="alert">
        {error}
      </p>
    );
  }

  if (notes.length === 0) {
    return <p className={styles.copy}>No medical notes yet.</p>;
  }

  return (
    <ul className={styles.list}>
      {notes.map((note) => (
        <li className={styles.item} key={note.id}>
          <span className={styles.category}>{note.category}</span>
          <p className={styles.noteText}>{note.note_text}</p>
        </li>
      ))}
    </ul>
  );
}
