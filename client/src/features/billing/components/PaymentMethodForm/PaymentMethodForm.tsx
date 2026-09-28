import {
  BANK_NAMES,
  PAYMENT_METHODS,
  type PaymentFields,
} from '../../billing.types';
import styles from './PaymentMethodForm.module.css';

interface PaymentMethodFormProps {
  value: PaymentFields;
  onChange: (next: PaymentFields) => void;
  amountDue: number;
  /** Overrides the method dropdown options. Defaults to PAYMENT_METHODS; the
   * Transactions page passes [...PAYMENT_METHODS, 'Credit'] so a cashier can
   * settle a booking payment straight from account credit here. */
  methods?: readonly string[];
  /** Transactions "Mark as paid" modal: it has its own single "Amount paid"
   * field, so suppress the Cash-tendered input and the computed-change line
   * (the transaction stores neither). Checkout / misc-sale leave this off. */
  hideCashTendered?: boolean;
  /** Methods listed but not selectable (e.g. misc-sale Credit when the
   * customer's balance doesn't cover the sale). */
  disabledMethods?: readonly string[];
  /** Display text per method, defaulting to the method itself. */
  methodLabels?: Partial<Record<string, string>>;
  /** Links the method select to an explanation elsewhere on the page. */
  methodDescribedBy?: string;
}

/**
 * Issue #86: renders the correct minimal form per selected payment method -
 * Cash shows a tendered-amount field and computed change; every other method
 * (GCash, Maya, Card, Bank Transfer, Grabmart, Pickaroo) shows a
 * reference-number field (Bank Transfer additionally shows a BPI/BDO
 * selector) and is confirmed by the cashier the moment the form is
 * submitted.
 */
export function PaymentMethodForm({
  value,
  onChange,
  amountDue,
  methods = PAYMENT_METHODS,
  hideCashTendered = false,
  disabledMethods = [],
  methodLabels = {},
  methodDescribedBy,
}: PaymentMethodFormProps) {
  const isBankTransfer = value.payment_method === 'Bank Transfer';
  const isCash = value.payment_method === 'Cash';
  // 'Credit' is only ever in `methods` on the Transactions page - it isn't a
  // PaymentMethod, so compare as a string.
  const isCredit = (value.payment_method as string) === 'Credit';
  const showReference = !isCash && !isCredit;

  const showCashTendered = isCash && !hideCashTendered;
  const change =
    showCashTendered && value.cash_tendered !== undefined
      ? Math.max(0, value.cash_tendered - amountDue)
      : null;

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Payment method</legend>

      <label className={styles.field}>
        <span className={styles.label}>Method</span>
        <select
          className={styles.input}
          value={value.payment_method}
          aria-describedby={methodDescribedBy}
          onChange={(event) =>
            onChange({
              ...value,
              payment_method: event.target
                .value as PaymentFields['payment_method'],
              bank_name: undefined,
              cash_tendered: undefined,
            })
          }
        >
          {methods.map((method) => (
            <option
              key={method}
              value={method}
              disabled={disabledMethods.includes(method)}
            >
              {methodLabels[method] ?? method}
            </option>
          ))}
        </select>
      </label>

      {isBankTransfer ? (
        <label className={styles.field}>
          <span className={styles.label}>Bank</span>
          <select
            className={styles.input}
            value={value.bank_name ?? ''}
            onChange={(event) =>
              onChange({
                ...value,
                bank_name: event.target.value as PaymentFields['bank_name'],
              })
            }
          >
            <option value="" disabled>
              Select bank
            </option>
            {BANK_NAMES.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showCashTendered ? (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Cash tendered (PHP)</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              step="0.01"
              placeholder={amountDue.toFixed(2)}
              value={value.cash_tendered ?? ''}
              onChange={(event) =>
                onChange({
                  ...value,
                  cash_tendered: Number(event.target.value),
                })
              }
            />
          </label>
          {change !== null ? (
            <p className={styles.change}>Change: PHP {change.toFixed(2)}</p>
          ) : null}
        </>
      ) : null}

      {isCredit ? (
        <p className={styles.change}>
          Settled from the customer&apos;s account credit for this branch.
        </p>
      ) : null}

      {showReference ? (
        <label className={styles.field}>
          <span className={styles.label}>Reference number</span>
          <input
            className={styles.input}
            value={value.payment_reference ?? ''}
            onChange={(event) =>
              onChange({ ...value, payment_reference: event.target.value })
            }
          />
        </label>
      ) : null}
    </fieldset>
  );
}
