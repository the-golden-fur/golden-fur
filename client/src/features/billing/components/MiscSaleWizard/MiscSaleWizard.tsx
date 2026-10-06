import { useEffect, useMemo, useState } from 'react';
import { listProducts } from '../../../catalog/api/catalog.api';
import type { CatalogComboBoxItem } from '../../../catalog/components/CatalogComboBox/CatalogComboBox';
import type { CustomerProfile } from '../../../customers/customer.types';
import { BookingStepper } from '../../../booking/components/BookingStepper/BookingStepper';
import {
  createMiscSale,
  getMiscSaleCredit,
  getMiscSaleOptions,
  previewMiscSale,
} from '../../api/billing.api';
import type {
  MiscSaleOptions,
  MiscSalePreview,
  MiscSaleResponse,
  PaymentFields,
} from '../../billing.types';
import {
  buildMiscSaleItems,
  emptyCartRow,
  isCartValid,
  type CartRow,
} from './miscSaleCart';
import { CustomerStep } from './CustomerStep';
import { ProductsStep } from './ProductsStep';
import { DiscountPromoStep } from './DiscountPromoStep';
import { PaymentStep } from './PaymentStep';
import { canPayByCredit, isPayingByCredit } from './miscSaleCredit';
import { ConfirmationStep } from './ConfirmationStep';
import styles from './MiscSaleWizard.module.css';

type StepKey =
  | 'customer'
  | 'products'
  | 'discount'
  | 'payment'
  | 'confirmation';

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'products', label: 'Products' },
  { key: 'discount', label: 'Discount/Promo' },
  { key: 'payment', label: 'Payment' },
  { key: 'confirmation', label: 'Confirmation' },
];

interface MiscSaleWizardProps {
  accessToken: string;
  onCreated?: (result: MiscSaleResponse) => void;
  onClose: () => void;
  /** Label for the button shown after the sale is recorded. */
  closeLabel?: string;
  /** When set, a "Record another sale" button also appears after success. */
  onStartOver?: () => void;
}

/**
 * Session 115 (Stage C): the "New Misc Sale" button opens this instead of
 * the old single-page form - a step wizard modeled after the booking
 * flow's own stepper, reusing BookingStepper as-is (it has no
 * booking-specific logic, only a default aria-label - see its own doc
 * comment) rather than building a second one. Unlike CustomerBookingFlowPage,
 * each step is its own component file - that page's own doc comments flag
 * its one-giant-switch-case shape as accepted for its size, not a pattern
 * to copy for a wizard this much smaller.
 */
export function MiscSaleWizard({
  accessToken,
  onCreated,
  onClose,
  closeLabel = 'Close',
  onStartOver,
}: MiscSaleWizardProps) {
  const [currentStepKey, setCurrentStepKey] = useState<StepKey>('customer');
  const [furthestIndex, setFurthestIndex] = useState(0);

  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [products, setProducts] = useState<CatalogComboBoxItem[]>([]);
  const [cartRows, setCartRows] = useState<CartRow[]>([emptyCartRow('row-0')]);

  const [options, setOptions] = useState<MiscSaleOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [discountIds, setDiscountIds] = useState<string[]>([]);
  const [promoIds, setPromoIds] = useState<string[]>([]);

  const [payment, setPayment] = useState<PaymentFields>({
    payment_method: 'Cash',
  });
  const [creditToApply, setCreditToApply] = useState(0);
  // The customer's credit at this branch, keyed by customer so a changed
  // customer never shows the previous one's balance.
  const [credit, setCredit] = useState<{
    customerId: string;
    available: number | null;
    error: string | null;
  } | null>(null);

  const [rawPreview, setPreview] = useState<MiscSalePreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<MiscSaleResponse | null>(null);

  useEffect(() => {
    void listProducts(accessToken, { active_only: true }).then((response) => {
      if (response.data) setProducts(response.data);
    });
  }, [accessToken]);

  // The discounts/promos the admin configured for misc sales at this branch.
  useEffect(() => {
    let isMounted = true;

    void getMiscSaleOptions(accessToken).then((response) => {
      if (!isMounted) return;
      if (response.error || !response.data) {
        setOptionsError(
          response.error ?? 'Could not load discounts and promos.'
        );
        return;
      }
      setOptionsError(null);
      setOptions(response.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const customerId = customer?.id ?? null;
  useEffect(() => {
    if (!customerId) return;
    let isMounted = true;

    void getMiscSaleCredit(customerId, accessToken).then((response) => {
      if (!isMounted) return;
      setCredit({
        customerId,
        available: response.data?.available ?? null,
        error: response.data
          ? null
          : (response.error ?? "Could not load the customer's credit."),
      });
    });

    return () => {
      isMounted = false;
    };
  }, [customerId, accessToken]);

  const currentCredit =
    credit && credit.customerId === customerId ? credit : null;
  const availableCredit = currentCredit?.available ?? null;

  const discountKey = discountIds.join(',');
  const promoKey = promoIds.join(',');

  const itemsPayload = useMemo(() => buildMiscSaleItems(cartRows), [cartRows]);
  const itemsKey = useMemo(() => JSON.stringify(itemsPayload), [itemsPayload]);

  // Live-preview the cart + discount/promo lines as the cashier moves
  // through Discount/Promo and Payment - the Confirmation step renders
  // whatever this last resolved to, so picking a payment method other than
  // Cash on the Payment step correctly drops any Cash-only discount it had
  // shown a moment ago.
  useEffect(() => {
    if (!isCartValid(cartRows)) {
      return;
    }

    let isMounted = true;

    // isPreviewLoading/previewError/preview are all reset from the fetch's
    // own resolution below, not synchronously here - a plain top-of-effect
    // setState would trigger an extra synchronous render before the request
    // even starts (React's set-state-in-effect guidance, same convention as
    // SlotPicker's own availability fetch). The previous preview stays
    // visible until the new one lands rather than flashing "Calculating...".
    void previewMiscSale(
      {
        items: itemsPayload,
        payment_method: payment.payment_method,
        discount_ids: discountIds,
        promo_ids: promoIds,
      },
      accessToken
    ).then((response) => {
      if (!isMounted) return;
      setIsPreviewLoading(false);

      if (response.error || !response.data) {
        setPreviewError(response.error ?? 'Could not compute a preview.');
        return;
      }

      setPreviewError(null);
      setPreview(response.data);
    });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, payment.payment_method, discountKey, promoKey, accessToken]);

  // Derived rather than reset via a synchronous setState in the effect above
  // (react-hooks/set-state-in-effect) - an invalid cart hides whatever
  // preview last fetched instead of the effect clearing it out itself.
  const preview = isCartValid(cartRows) ? rawPreview : null;
  // What Credit would have to cover: discounts are Cash-only, so any
  // discount in the current preview falls away once Credit is picked.
  const creditTotal = preview
    ? preview.preCreditTotal + preview.discountAmount
    : null;

  const currentStepIndex = STEPS.findIndex(
    (step) => step.key === currentStepKey
  );

  function isStepValid(key: StepKey): boolean {
    if (key === 'customer') return customer !== null;
    if (key === 'products') return isCartValid(cartRows);
    if (key === 'payment') {
      if (isPayingByCredit(payment)) {
        return canPayByCredit(availableCredit, creditTotal);
      }
      if (payment.payment_method === 'Bank Transfer' && !payment.bank_name) {
        return false;
      }
      if (
        payment.payment_method === 'Cash' &&
        payment.cash_tendered === undefined
      ) {
        return false;
      }
      return true;
    }
    return true;
  }

  function goTo(index: number) {
    if (index < 0 || index >= STEPS.length) return;
    setCurrentStepKey(STEPS[index].key);
  }

  function goNext() {
    if (!isStepValid(currentStepKey)) return;
    const nextIndex = currentStepIndex + 1;
    setFurthestIndex((prev) => Math.max(prev, nextIndex));
    goTo(nextIndex);
  }

  function goBack() {
    goTo(currentStepIndex - 1);
  }

  async function handleConfirm() {
    if (!customer) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const response = await createMiscSale(
      {
        customer_id: customer.id,
        items: itemsPayload,
        discount_ids: discountIds,
        promo_ids: promoIds,
        credit_to_apply: creditToApply,
        ...payment,
      },
      accessToken
    );

    setIsSubmitting(false);

    if (response.error || !response.data) {
      setSubmitError(response.error ?? 'Could not record this sale.');
      return;
    }

    setResult(response.data);
    onCreated?.(response.data);
  }

  return (
    <div className={styles.wizard}>
      <BookingStepper
        steps={STEPS.map((step) => step.label)}
        currentStepIndex={currentStepIndex}
        furthestCompletedIndex={result ? STEPS.length - 1 : furthestIndex}
        onStepSelect={goTo}
        ariaLabel="Miscellaneous sale steps"
      />

      <div className={styles.stepContent}>
        {currentStepKey === 'customer' ? (
          <CustomerStep
            accessToken={accessToken}
            customer={customer}
            onSelect={setCustomer}
          />
        ) : currentStepKey === 'products' ? (
          <ProductsStep
            products={products}
            rows={cartRows}
            onRowsChange={setCartRows}
          />
        ) : currentStepKey === 'discount' ? (
          <DiscountPromoStep
            options={options}
            optionsError={optionsError}
            selectedDiscountIds={discountIds}
            selectedPromoIds={promoIds}
            onDiscountIdsChange={setDiscountIds}
            onPromoIdsChange={setPromoIds}
            preview={preview}
            isPreviewLoading={isPreviewLoading}
            previewError={previewError}
          />
        ) : currentStepKey === 'payment' ? (
          <PaymentStep
            payment={payment}
            onPaymentChange={setPayment}
            creditToApply={creditToApply}
            onCreditChange={setCreditToApply}
            amountDue={preview?.preCreditTotal ?? 0}
            availableCredit={availableCredit}
            creditError={currentCredit?.error ?? null}
            creditTotal={creditTotal}
          />
        ) : (
          <ConfirmationStep
            customer={customer}
            payment={payment}
            creditToApply={creditToApply}
            preview={preview}
            isPreviewLoading={isPreviewLoading}
            isSubmitting={isSubmitting}
            error={submitError}
            result={result}
            onConfirm={() => void handleConfirm()}
          />
        )}
      </div>

      {result ? (
        <div className={styles.navRow}>
          <button
            type="button"
            className={styles.buttonSecondary}
            onClick={onClose}
          >
            {closeLabel}
          </button>
          {onStartOver ? (
            <button
              type="button"
              className={styles.button}
              onClick={onStartOver}
            >
              Record another sale
            </button>
          ) : null}
        </div>
      ) : (
        <div className={styles.navRow}>
          <button
            type="button"
            className={styles.buttonSecondary}
            disabled={currentStepIndex === 0}
            onClick={goBack}
          >
            Back
          </button>
          {currentStepKey !== 'confirmation' ? (
            <button
              type="button"
              className={styles.button}
              disabled={!isStepValid(currentStepKey)}
              onClick={goNext}
            >
              Next
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
