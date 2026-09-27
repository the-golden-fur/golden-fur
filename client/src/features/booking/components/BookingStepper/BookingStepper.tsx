import styles from './BookingStepper.module.css';

interface BookingStepperProps {
  /** Already filtered/ordered for this booking - e.g. Staff Picker omitted
   * entirely (not just hidden) for Hotel/Daycare or a disabled toggle (#55
   * dev notes: "the stepper must recompute total step count dynamically
   * rather than assuming a fixed 8"). */
  steps: string[];
  currentStepIndex: number;
  /** Steps at or before this index have already been completed and can be
   * clicked to go back to without losing later-step selections (AC-2) -
   * the page itself keeps all step state, so re-visiting a step never
   * clears anything. */
  furthestCompletedIndex: number;
  onStepSelect: (index: number) => void;
  /** Session 115: reused as-is by the misc-sale wizard (billing feature) -
   * this component has no booking-specific logic in its own right, only in
   * its default label. Defaults to "Booking steps" so every existing caller
   * is unaffected. */
  ariaLabel?: string;
}

export function BookingStepper({
  steps,
  currentStepIndex,
  furthestCompletedIndex,
  onStepSelect,
  ariaLabel = 'Booking steps',
}: BookingStepperProps) {
  return (
    <ol className={styles.stepper} aria-label={ariaLabel}>
      {steps.map((label, index) => {
        const isCurrent = index === currentStepIndex;
        const isReachable = index <= furthestCompletedIndex;
        const status = isCurrent
          ? 'current'
          : index < currentStepIndex
            ? 'done'
            : 'upcoming';

        return (
          <li key={label} className={styles.step}>
            <button
              type="button"
              className={`${styles.stepButton} ${styles[status]}`}
              aria-current={isCurrent ? 'step' : undefined}
              disabled={!isReachable}
              onClick={() => onStepSelect(index)}
            >
              <span className={styles.stepNumber}>{index + 1}</span>
              <span className={styles.stepLabel}>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
