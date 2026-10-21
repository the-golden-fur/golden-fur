import { useEffect, useState } from 'react';
import {
  checkOutHotelStay,
  getHotelCheckoutPreview,
} from '../../api/hotel.api';
import { HotelBillBreakdown } from '../../components/HotelBillBreakdown/HotelBillBreakdown';
import { HotelStayPicker } from '../../components/HotelStayPicker/HotelStayPicker';
import type {
  CheckoutResult,
  HotelCheckoutPreview,
  HotelStayWithCage,
} from '../../hotel.types';
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
  // The bill "if checked out now" for the stay about to be confirmed - null
  // while loading or when it could not be worked out (checkout still works
  // without it). Keyed by stay id so a reply for a stay since swapped out
  // is never shown against another.
  const [preview, setPreview] = useState<{
    stayId: string;
    data: HotelCheckoutPreview | null;
  } | null>(null);
  const confirmStayId = selectedStay?.id ?? initialStayId;

  useEffect(() => {
    if (!confirmStayId || result) return;

    let isCurrent = true;
    void getHotelCheckoutPreview(confirmStayId, accessToken).then(
      (previewResult) => {
        if (isCurrent) {
          setPreview({ stayId: confirmStayId, data: previewResult.data });
        }
      }
    );

    return () => {
      isCurrent = false;
    };
  }, [accessToken, confirmStayId, result]);

  const isPreviewLoading =
    confirmStayId !== null && preview?.stayId !== confirmStayId;
  const currentPreview = isPreviewLoading ? null : (preview?.data ?? null);

  const previewBlock = isPreviewLoading ? (
    <p className={styles.copy}>Working out the bill…</p>
  ) : currentPreview ? (
    <>
      <p className={styles.copy}>
        If checked out now (as of{' '}
        {new Date(currentPreview.as_of).toLocaleTimeString(undefined, {
          timeStyle: 'short',
        })}
        ):
      </p>
      <HotelBillBreakdown
        breakdown={currentPreview.breakdown}
        downpaymentCollected={currentPreview.downpayment_collected}
        addedAtCheckout={currentPreview.added_at_checkout}
        amountDue={currentPreview.amount_due}
      />
    </>
  ) : null;

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

  // Pay at checkout: nothing was collected up front and no extension fee
  // applies - the stay is billed for the nights actually stayed, and that
  // bill is now on the cashier's Transactions list.
  // The itemized bill when the server sent one - the same breakdown the
  // preview showed before confirming.
  if (result?.bill) {
    return (
      <>
        <p className={styles.successBanner} role="status">
          Stay checked out. Cage released.
          {result.payAtCheckout
            ? ' The bill has been sent to the cashier.'
            : ''}
        </p>
        <HotelBillBreakdown
          breakdown={result.bill}
          downpaymentCollected={result.downpaymentAmount}
          addedAtCheckout={result.payAtCheckout ? null : result.extensionFee}
          amountDue={result.remainingBalance}
        />
      </>
    );
  }

  if (result?.payAtCheckout) {
    const { nights } = result.payAtCheckout;

    return (
      <>
        <p className={styles.successBanner} role="status">
          Stay checked out. Cage released. The bill has been sent to the
          cashier.
        </p>
        <dl className={styles.breakdown}>
          <div className={styles.breakdownRow}>
            <dt>Nights stayed</dt>
            <dd>{nights}</dd>
          </div>
          <div className={styles.breakdownTotal}>
            <dt>To collect at the cashier</dt>
            <dd>₱{result.remainingBalance}</dd>
          </div>
        </dl>
      </>
    );
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

        {previewBlock}

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
            <dd>{formatDate(selectedStay.scheduled_check_out_date!)}</dd>
          </div>
          <div className={styles.breakdownRow}>
            <dt>Downpayment already collected</dt>
            <dd>₱{selectedStay.downpayment_amount!.toFixed(2)}</dd>
          </div>
        </dl>

        {previewBlock}

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
