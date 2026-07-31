import { useEffect, useState } from 'react';
import { listProducts } from '../../../catalog/api/catalog.api';
import {
  CatalogComboBox,
  type CatalogComboBoxItem,
  type CatalogComboBoxValue,
} from '../../../catalog/components/CatalogComboBox/CatalogComboBox';
import { CustomerPicker } from '../../../booking/components/CustomerPicker/CustomerPicker';
import type { CustomerProfile } from '../../../customers/customer.types';
import { createMiscSale } from '../../api/billing.api';
import { CreditApplicationPanel } from '../CreditApplicationPanel/CreditApplicationPanel';
import { PaymentMethodForm } from '../PaymentMethodForm/PaymentMethodForm';
import { PayMongoServiceFeeNotice } from '../PayMongoServiceFeeNotice/PayMongoServiceFeeNotice';
import type { MiscSaleResponse, PaymentFields } from '../../billing.types';
import styles from './MiscellaneousSaleForm.module.css';

const EMPTY_COMBO: CatalogComboBoxValue = { catalogId: null, text: '' };
const DEFAULT_PAYMENT: PaymentFields = { payment_method: 'Cash' };

interface MiscellaneousSaleFormProps {
  accessToken: string;
  onCreated?: (result: MiscSaleResponse) => void;
}

/**
 * Issue #87: quick counter-sale form, reachable independently of the
 * booking-checkout flow. Reuses CreditApplicationPanel and PaymentMethodForm
 * as-is from Issue #86 rather than duplicating credit-application or
 * payment-form logic (dev notes). The only new UI surface here is the
 * product picker (all active catalog products - per unification, shows
 * hotel food/medication alongside any future retail item - plus a freetext
 * fallback with a manual amount, since a freetext item has no catalog price
 * to look up) and the customer picker (misc sales require a customer_id -
 * see billing.validator.ts's createMiscSaleValidator).
 */
export function MiscellaneousSaleForm({
  accessToken,
  onCreated,
}: MiscellaneousSaleFormProps) {
  const [products, setProducts] = useState<CatalogComboBoxItem[]>([]);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(true);

  const [item, setItem] = useState<CatalogComboBoxValue>(EMPTY_COMBO);
  const [quantity, setQuantity] = useState(1);
  const [freetextAmount, setFreetextAmount] = useState('');

  const [payment, setPayment] = useState<PaymentFields>(DEFAULT_PAYMENT);
  const [creditToApply, setCreditToApply] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MiscSaleResponse | null>(null);

  useEffect(() => {
    void listProducts(accessToken, { active_only: true }).then((response) => {
      if (response.data) setProducts(response.data);
    });
  }, [accessToken]);

  const selectedProduct = products.find(
    (product) => product.id === item.catalogId
  );
  const subtotal = item.catalogId
    ? (selectedProduct?.price ?? 0) * quantity
    : Number(freetextAmount) || 0;
  const amountDue = Math.max(0, subtotal - creditToApply);

  async function handleSubmit() {
    if (!customer) {
      setError('Select a customer before recording a sale.');
      return;
    }

    if (!item.catalogId && (!item.text.trim() || !freetextAmount)) {
      setError('Enter an item description and amount, or pick a catalog item.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const response = await createMiscSale(
      {
        customer_id: customer.id,
        ...(item.catalogId
          ? { product_catalog_id: item.catalogId, quantity }
          : { description: item.text.trim(), amount: Number(freetextAmount) }),
        credit_to_apply: creditToApply,
        ...payment,
      },
      accessToken
    );

    setIsSubmitting(false);

    if (response.error || !response.data) {
      setError(response.error ?? 'Could not record this sale.');
      return;
    }

    setResult(response.data);
    onCreated?.(response.data);

    if (response.data.paymongoCheckoutUrl) {
      window.location.href = response.data.paymongoCheckoutUrl;
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="misc-sale-title">
      <h2 className={styles.title} id="misc-sale-title">
        New Miscellaneous Sale
      </h2>

      <div className={styles.field}>
        <span className={styles.label}>Customer</span>
        {customer && !showCustomerPicker ? (
          <div className={styles.selectedCustomer}>
            <span>{customer.full_name}</span>
            <button
              type="button"
              className={styles.smallButtonSecondary}
              onClick={() => setShowCustomerPicker(true)}
            >
              Change
            </button>
          </div>
        ) : (
          <CustomerPicker
            accessToken={accessToken}
            selectedCustomerId={customer?.id ?? null}
            onSelect={(selected) => {
              setCustomer(selected);
              setShowCustomerPicker(false);
            }}
          />
        )}
      </div>

      <div className={styles.itemRow}>
        <CatalogComboBox
          items={products}
          value={item}
          onChange={setItem}
          placeholder="Search products or type a custom item..."
        />
        {item.catalogId ? (
          <input
            className={styles.quantityInput}
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value) || 1)}
            aria-label="Quantity"
          />
        ) : (
          <input
            className={styles.amountInput}
            type="number"
            min="0.01"
            step="0.01"
            value={freetextAmount}
            onChange={(event) => setFreetextAmount(event.target.value)}
            placeholder="Amount (PHP)"
            aria-label="Amount (PHP)"
          />
        )}
      </div>

      <p className={styles.subtotal}>Subtotal: PHP {subtotal.toFixed(2)}</p>

      <CreditApplicationPanel
        availableBalance={0}
        transactionTotal={subtotal}
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

      <p className={styles.amountDue}>Amount due: PHP {amountDue.toFixed(2)}</p>

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <p className={styles.successBanner}>
          Sale recorded - {result.transaction.payment_status}.
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
          {isSubmitting ? 'Recording...' : 'Record sale'}
        </button>
      )}
    </section>
  );
}
