import { useState } from 'react';
import { checkOutHotelStay } from '../../api/hotel.api';
import { HotelStayPicker } from '../../components/HotelStayPicker/HotelStayPicker';
import type { CheckoutResult, HotelStayWithCage } from '../../hotel.types';
import styles from './HotelCheckoutPanel.module.css';

interface HotelCheckoutPanelProps {
  accessToken: string;
  /** Preselects the confirm step, skipping the picker - set by
   * HotelQueuePage right after HotelCheckInPanel checks a pet in, or by the
   * legacy /staff/hotel/checkout/:stayId redirect. Null shows the picker. */
  initialStayId: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * Issue #81 revision: a search/filter/sort picker (HotelStayPicker) over
 * active stays replaces the original raw "paste the stay id" text field.
 * The remaining balance is visually larger/bolder than the downpayment-
 * already-collected figure (AC-1/AC-2), so there's no ambiguity about which
 * number the future Sprint 5 cashier flow will collect.
 *
 * Queue redesign: extracted from the former standalone HotelCheckoutPage so
 * it can render as a tab panel inside HotelQueuePage (alongside
 * HotelCheckInPanel) instead of its own route - HotelQueuePage renders this
 * with `key={initialStayId ?? 'picker'}` so a fresh preselect (or a return
 * to the bare picker) resets this panel's internal state cleanly.
 */
export function HotelCheckoutPanel({
  accessToken,
  initialStayId,
}: HotelCheckoutPanelProps) {
  const [selectedStay, setSelectedStay] = useState<HotelStayWithCage | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);

  async function submitCheckout(stayId: string) {
    setIsSubmitting(true);
    setError(null);

    const checkoutResult = await checkOutHotelStay(stayId, accessToken);

    setIsSubmitting(false);

    if (checkoutResult.error || !checkoutResult.data) {
      setError(checkoutResult.error ?? 'Could not check out this stay.');
      return;
    }

    setResult(checkoutResult.data);
  }

  if (result) {
    return (
      <>
        <p className={styles.successBanner} role="status">
          Stay checked out. Cage released.
        </p>
        <dl className={styles.breakdown}>
          <div className={styles.breakdownRow}>
            <dt>Downpayment already collected</dt>
            <dd>₱{result.downpaymentAmount}</dd>
          </div>
          <div className={styles.breakdownRow}>
            <dt>Extension fee</dt>
            <dd>
              {result.extensionFee === null
                ? 'None'
                : `₱${result.extensionFee}`}
            </dd>
          </div>
          <div className={styles.breakdownRow}>
            <dt>Hotel-supplied items</dt>
            <dd>
              {result.suppliedItemsCharge === null
                ? 'None'
                : `₱${result.suppliedItemsCharge}`}
            </dd>
          </div>
          <div className={styles.breakdownTotal}>
            <dt>Remaining balance</dt>
            <dd>₱{result.remainingBalance}</dd>
          </div>
        </dl>
      </>
    );
  }

  // Arrived with a known stay id (HotelCheckInPanel's "Go to checkout", or
  // the legacy /staff/hotel/checkout/:stayId redirect) - skip the picker and
  // go straight to confirm.
  if (initialStayId && !selectedStay) {
    return (
      <>
        {error ? (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        ) : null}

        <p className={styles.copy}>Ready to check out this stay?</p>

        <button
          type="button"
          className={styles.primaryButton}
          disabled={isSubmitting}
          onClick={() => void submitCheckout(initialStayId)}
        >
          {isSubmitting ? 'Checking out...' : 'Check out now'}
        </button>
      </>
    );
  }

  if (selectedStay) {
    return (
      <>
        <dl className={styles.breakdown}>
          <div className={styles.breakdownRow}>
            <dt>Cage</dt>
            <dd>{selectedStay.cage_label}</dd>
          </div>
          <div className={styles.breakdownRow}>
            <dt>Checkout due</dt>
            <dd>{formatDate(selectedStay.scheduled_check_out_date)}</dd>
          </div>
          <div className={styles.breakdownRow}>
            <dt>Downpayment already collected</dt>
            <dd>₱{selectedStay.downpayment_amount.toFixed(2)}</dd>
          </div>
        </dl>

        {error ? (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={isSubmitting}
            onClick={() => void submitCheckout(selectedStay.id)}
          >
            {isSubmitting ? 'Checking out...' : 'Check out now'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setSelectedStay(null)}
          >
            Choose a different stay
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      <HotelStayPicker accessToken={accessToken} onSelect={setSelectedStay} />
    </>
  );
}
