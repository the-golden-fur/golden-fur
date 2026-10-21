import { Modal } from '../../../shared/components/Modal/Modal';
import type { TourSection } from './tourSections';
import styles from './TourSectionPicker.module.css';

interface TourSectionPickerProps {
  sections: TourSection[];
  /** No id = the full tour. */
  onStart: (sectionId?: string) => void;
  onClose: () => void;
}

/** "Which part do you want to see?" - opened by Settings > Preferences and
 * the mascot's Tutorial bubble before a replay. */
export function TourSectionPicker({
  sections,
  onStart,
  onClose,
}: TourSectionPickerProps) {
  return (
    // Own top layer, so the Modal (and its dim) sits above the mascot too.
    <div className={styles.layer}>
      <Modal isOpen title="Tutorial" onClose={onClose}>
        <div className={styles.body}>
          <p className={styles.copy}>
            Take the whole tour, or pick the part you want to see again.
          </p>

          <button
            type="button"
            className={styles.fullTour}
            onClick={() => onStart()}
          >
            Full tour
          </button>

          <ul className={styles.list}>
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className={styles.section}
                  onClick={() => onStart(section.id)}
                >
                  <span className={styles.sectionTitle}>{section.title}</span>
                  <span className={styles.sectionCount}>
                    {section.steps.length}{' '}
                    {section.steps.length === 1 ? 'step' : 'steps'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </div>
  );
}
