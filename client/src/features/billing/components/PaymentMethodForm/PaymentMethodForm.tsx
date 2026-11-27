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
   * field, so suppress the amount input (Cash-tendered or the generic
   * Amount field alike) and the computed-change line (the transaction
   * stores neither). Checkout / misc-sale leave this off. */
  hideCashTendered?: boolean;
  /** Methods listed but not selectable (e.g. misc-sale Credit when the
   * customer's balance doesn't cover the sale). */
  disabledMethods?: readonly string[];
  /** Display text per method, defaulting to the method itself. */
  methodLabels?: Partial<Record<string, string>>;
  /** Links the method select to an explanation elsewhere on the page. */
  methodDescribedBy?: string;
  /** Transactions "Mark as paid" modal: drop the "Payment method"
   * fieldset/legend wrapper so Method sits as a bare field alongside the
   * modal's own Amount paid / Receipt fields instead of boxed off on its
   * own. Pass fieldClassName/inputClassName matching the modal's own field
   * styling so every field in the modal lines up the same way. */
  hideLegend?: boolean;
  fieldClassName?: string;
  inputClassName?: string;
}

/**
 * Issue #86: renders the correct minimal form per selected payment method -
 * every method but Credit gets an amount field (Cash: "Cash tendered",
 * which also drives the computed change; everything else: a plain
 * "Amount" alongside its reference-number field - Bank Transfer
 * additionally shows a BPI/BDO selector) and is confirmed by the cashier
 * the moment the form is submitted.
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
  hideLegend = false,
  fieldClassName,
  inputClassName,
}: PaymentMethodFormProps) {
  const isBankTransfer = value.payment_method === 'Bank Transfer';
  const isCash = value.payment_method === 'Cash';
  // 'Credit' is only ever in `methods` on the Transactions page - it isn't a
  // PaymentMethod, so compare as a string.
  const isCredit = (value.payment_method as string) === 'Credit';
  const showReference = !isCash && !isCredit;
  // An amount field shows for every method except Credit (which settles
  // itself) - "Cash tendered" for Cash (drives the change calc below), a
  // plain "Amount" next to the reference field for everything else, so a
  // cashier isn't left confirming a GCash/Card/Bank Transfer payment with no
  // amount captured at all.
  const showAmountField = !isCredit && !hideCashTendered;
  const change =
    isCash && showAmountField && value.cash_tendered !== undefined
      ? Math.max(0, value.cash_tendered - amountDue)
      : null;

  // A caller-supplied fieldClassName means "match my own page's fields" -
  // the uppercase/secondary-color label styling this form otherwise applies
  // comes along with its own default field class, so it's dropped too
  // (inheriting the custom field class's own typography instead).
  const fieldClass = fieldClassName ?? styles.field;
  const inputClass = inputClassName ?? styles.input;
  const labelClass = fieldClassName ? undefined : styles.label;

  const amountField = showAmountField ? (
    <label className={fieldClass}>
      <span className={labelClass}>
        {isCash ? 'Cash tendered (PHP)' : 'Amount (PHP)'}
      </span>
      <input
        className={inputClass}
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
  ) : null;

  const referenceField = showReference ? (
    <label className={fieldClass}>
      <span className={labelClass}>Reference number</span>
      <input
        className={inputClass}
        value={value.payment_reference ?? ''}
        onChange={(event) =>
          onChange({ ...value, payment_reference: event.target.value })
        }
      />
    </label>
  ) : null;

  const content = (
    <>
      <label className={fieldClass}>
        <span className={labelClass}>Method</span>
        <select
          className={inputClass}
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
        <label className={fieldClass}>
          <span className={labelClass}>Bank</span>
          <select
            className={inputClass}
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

      {isCash ? (
        <>
          {amountField}
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

      {!isCash && !isCredit && (amountField || referenceField) ? (
        <div className={styles.row}>
          {amountField}
          {referenceField}
        </div>
      ) : null}
    </>
  );

  if (hideLegend) {
    return content;
  }

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Payment method</legend>
      {content}
    </fieldset>
  );
}
