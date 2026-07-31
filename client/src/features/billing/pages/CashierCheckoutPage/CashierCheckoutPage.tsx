import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { checkoutBooking, previewCheckout } from '../../api/billing.api';
import { CreditApplicationPanel } from '../../components/CreditApplicationPanel/CreditApplicationPanel';
import { PaymentMethodForm } from '../../components/PaymentMethodForm/PaymentMethodForm';
import { PayMongoServiceFeeNotice } from '../../components/PayMongoServiceFeeNotice/PayMongoServiceFeeNotice';
import type {
  CheckoutPreview,
  CheckoutResponse,
  PaymentFields,
} from '../../billing.types';
import styles from './CashierCheckoutPage.module.css';

const DEFAULT_PAYMENT: PaymentFields = { payment_method: 'Cash' };

/**
 * Issue #86: single checkout screen showing every line item (services,
 * add-ons, auto-applied discounts/promos - AC-1), the customer's available
 * credit (AC-2), and whichever payment method form applies (AC-3), with the
 * PayMongo fee notice (AC-4) rendered inline via PayMongoServiceFeeNotice.
 * The preview (GET /billing/checkout/:bookingId/preview) and the real
 * checkout (POST /billing/checkout) share the exact same aggregation logic
 * server-side (checkoutAggregation.service.ts's buildCheckoutPreview), so
 * what the cashier sees here is what gets charged.
 */
export function CashierCheckoutPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ bookingId?: string }>();

  const [bookingIdInput, setBookingIdInput] = useState(params.bookingId ?? '');
  const [bookingId, setBookingId] = useState(params.bookingId ?? '');
  const [seniorCitizenEligible, setSeniorCitizenEligible] = useState(false);
  const [pwdEligible, setPwdEligible] = useState(false);

  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [payment, setPayment] = useState<PaymentFields>(DEFAULT_PAYMENT);
  const [creditToApply, setCreditToApply] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResponse | null>(null);

  useEffect(() => {
    if (!bookingId || !accessToken) return;

    let isMounted = true;

    // isLoadingPreview/previewError/result are set from the fetch's own
    // resolution below, not synchronously here - matches SlotPicker.tsx's
    // own "avoid an extra synchronous render before the request even
    // starts" convention. Stale preview data stays visible until the new
    // result lands.
    void previewCheckout(
      bookingId,
      { seniorCitizenEligible, pwdEligible },
      accessToken
    ).then((response) => {
      if (!isMounted) return;
      setIsLoadingPreview(false);
      setResult(null);

      if (response.error || !response.data) {
        setPreview(null);
        setPreviewError(response.error ?? 'Could not load this booking.');
        return;
      }

      setPreviewError(null);
      setPreview(response.data);
    });

    return () => {
      isMounted = false;
    };
  }, [bookingId, seniorCitizenEligible, pwdEligible, accessToken]);

  const amountDue = preview
    ? Math.max(0, preview.preCreditTotal - creditToApply)
    : 0;

  async function handleSubmit() {
    if (!accessToken || !bookingId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const response = await checkoutBooking(
      {
        booking_id: bookingId,
        senior_citizen_eligible: seniorCitizenEligible,
        pwd_eligible: pwdEligible,
        credit_to_apply: creditToApply,
        ...payment,
      },
      accessToken
    );

    setIsSubmitting(false);

    if (response.error || !response.data) {
      setSubmitError(response.error ?? 'Checkout failed. Please try again.');
      return;
    }

    setResult(response.data);

    if (response.data.paymongoCheckoutUrl) {
      window.location.href = response.data.paymongoCheckoutUrl;
    }
  }

  if (!accessToken) {
    return <p>Loading...</p>;
  }

  const allLines = preview
    ? [...preview.serviceLines, ...preview.discountLines, ...preview.promoLines]
    : [];

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Cashier Checkout</h1>

        <label className={styles.field}>
          <span className={styles.label}>Booking ID</span>
          <div className={styles.bookingRow}>
            <input
              className={styles.input}
              value={bookingIdInput}
              onChange={(event) => setBookingIdInput(event.target.value)}
              placeholder="Paste a booking ID"
            />
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => {
                setBookingId(bookingIdInput.trim());
                navigate(`/staff/billing/checkout/${bookingIdInput.trim()}`, {
                  replace: true,
                });
              }}
            >
              Load
            </button>
          </div>
        </label>

        {isLoadingPreview ? <p className={styles.copy}>Loading...</p> : null}
        {previewError ? (
          <p className={styles.errorBanner} role="alert">
            {previewError}
          </p>
        ) : null}

        {preview ? (
          <>
            <section
              className={styles.panel}
              aria-labelledby="line-items-title"
            >
              <h2 className={styles.sectionTitle} id="line-items-title">
                Line items
              </h2>
              <ul className={styles.lineItemList}>
                {allLines.map((line, index) => (
                  <li key={index} className={styles.lineItem}>
                    <span>{line.description}</span>
                    <span>
                      {line.line_total < 0 ? '-' : ''}PHP{' '}
                      {Math.abs(line.line_total).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className={styles.runningTotal}>
                <span>Total</span>
                <span>PHP {preview.preCreditTotal.toFixed(2)}</span>
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="mandated-title">
              <h2 className={styles.sectionTitle} id="mandated-title">
                Government-mandated discounts
              </h2>
              <label className={styles.checkboxOption}>
                <input
                  type="checkbox"
                  checked={seniorCitizenEligible}
                  onChange={(event) =>
                    setSeniorCitizenEligible(event.target.checked)
                  }
                />
                Senior Citizen
              </label>
              <label className={styles.checkboxOption}>
                <input
                  type="checkbox"
                  checked={pwdEligible}
                  onChange={(event) => setPwdEligible(event.target.checked)}
                />
                PWD
              </label>
            </section>

            <CreditApplicationPanel
              availableBalance={0}
              transactionTotal={preview.preCreditTotal}
              creditToApply={creditToApply}
              onChange={setCreditToApply}
            />

            <PaymentMethodForm
              value={payment}
              onChange={setPayment}
              amountDue={amountDue}
            />

            <PayMongoServiceFeeNotice
              paymentMethod={payment.payment_method}
              accessToken={accessToken}
            />

            <p className={styles.amountDue}>
              Amount due: PHP {amountDue.toFixed(2)}
            </p>

            {submitError ? (
              <p className={styles.errorBanner} role="alert">
                {submitError}
              </p>
            ) : null}

            {result ? (
              <p className={styles.successBanner}>
                Checkout complete - {result.transaction.payment_status}.
                {result.changeAmount !== null
                  ? ` Change: PHP ${result.changeAmount.toFixed(2)}`
                  : ''}
              </p>
            ) : (
              <button
                type="button"
                className={styles.button}
                disabled={isSubmitting}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting ? 'Processing...' : 'Confirm checkout'}
              </button>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
