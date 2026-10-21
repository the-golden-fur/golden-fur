import { useCallback, useState } from 'react';
import { Modal } from '../../../../shared/components/Modal/Modal';
import styles from './StorePoliciesModal.module.css';

interface PolicySection {
  title: string;
  /** Each item is one bullet; `items` nested under a label render as a
   * sub-list (the age rules). */
  items: Array<string | { label: string; items: string[] }>;
}

const STORE_POLICIES: PolicySection[] = [
  {
    title: 'Requirements for Grooming, Daycare, and Pet Hotel',
    items: [
      'Vaccines: pets must have complete vaccinations, meaning anti-rabies plus a 5-in-1, 6-in-1, or 8-in-1. Please bring your pet’s vaccination record.',
      'Health: pets must be free of ticks and fleas, not pregnant, and free of contagious illness. Pets with a medical condition or recent surgery need a vet clearance.',
      {
        label: 'Age:',
        items: [
          'Below 4 months: not accepted.',
          '4–6 months: bath and blow-dry or sanitary groom only.',
          'Under 6 months: not accepted for daycare or pet hotel.',
        ],
      },
      'Behavior: aggressive pets are generally not accepted. All pets are assessed on arrival.',
    ],
  },
  {
    title: 'Waiver Form',
    items: [
      'All pet owners must sign a waiver form upon arriving at the branch before any service starts.',
      'Pets with incomplete vaccinations or aggressive behavior may only be accepted with a signed waiver.',
    ],
  },
  {
    title: 'Veterinary Services',
    items: [
      'The requirements above do not apply to vet services.',
      'Please bring your pet’s record book. If you don’t have one, we can give you one for free.',
    ],
  },
  {
    title: 'Pet Hotel and Daycare',
    items: [
      'Daycare: ₱100 for the first hour and ₱50 for each additional hour. Pets must be picked up before closing.',
      'Late pick-up: pets not picked up before closing will stay overnight, and an overnight charge will be added.',
    ],
  },
  {
    title: 'Cancellations and Refunds',
    items: [
      'No cash refunds. Paid bookings that are cancelled, and unused hotel nights, become store credit.',
    ],
  },
];

interface StorePoliciesModalProps {
  onClose: () => void;
  onAgree: () => void;
}

/**
 * Shown by CustomerBookingFlowPage every time a customer leaves the Branch
 * step - they must scroll to the end of the policies, then tick the
 * agreement, before continuing to the Pet step.
 * Rendered only while open (the page mounts/unmounts it), so the checkbox
 * starts unticked on every showing.
 */
export function StorePoliciesModal({
  onClose,
  onAgree,
}: StorePoliciesModalProps) {
  const [hasAgreed, setHasAgreed] = useState(false);
  // The agreement unlocks only once the policy text has been scrolled to
  // its end.
  const [hasReadAll, setHasReadAll] = useState(false);

  const checkReadAll = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    // A few pixels of slack: zoomed or high-DPI screens can stop a fraction
    // short of the exact bottom. Text that fits without scrolling counts as
    // read straight away (scrollHeight == clientHeight).
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 4) {
      setHasReadAll(true);
    }
  }, []);

  return (
    <Modal isOpen title="Store policies" onClose={onClose}>
      {/* Scrolls on its own so the agreement below stays in view. */}
      <div
        ref={checkReadAll}
        className={styles.policies}
        tabIndex={0}
        aria-label="Store policy text"
        onScroll={(event) => checkReadAll(event.currentTarget)}
      >
        <ol className={styles.sectionList}>
          {STORE_POLICIES.map((section) => (
            <li key={section.title} className={styles.section}>
              <h3 className={styles.sectionTitle}>{section.title}</h3>
              <ul className={styles.itemList}>
                {section.items.map((item) =>
                  typeof item === 'string' ? (
                    <li key={item}>{item}</li>
                  ) : (
                    <li key={item.label}>
                      {item.label}
                      <ul className={styles.subList}>
                        {item.items.map((subItem) => (
                          <li key={subItem}>{subItem}</li>
                        ))}
                      </ul>
                    </li>
                  )
                )}
              </ul>
            </li>
          ))}
        </ol>
      </div>

      {!hasReadAll ? (
        <p className={styles.scrollHint} id="store-policies-scroll-hint">
          Scroll to the end of the policies to continue.
        </p>
      ) : null}

      <label
        className={`${styles.agreeRow} ${hasReadAll ? '' : styles.agreeRowLocked}`}
      >
        <input
          type="checkbox"
          checked={hasAgreed}
          disabled={!hasReadAll}
          aria-describedby={
            hasReadAll ? undefined : 'store-policies-scroll-hint'
          }
          onChange={(event) => setHasAgreed(event.target.checked)}
        />
        I have read and agree to the store policies
      </label>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.continueButton}
          disabled={!hasReadAll || !hasAgreed}
          onClick={onAgree}
        >
          Continue
        </button>
      </div>
    </Modal>
  );
}
