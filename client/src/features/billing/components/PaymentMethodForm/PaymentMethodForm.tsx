import {
  BANK_NAMES,
  ONLINE_PAYMENT_METHODS,
  PAYMENT_METHODS,
  type PaymentFields,
} from '../../billing.types';
import styles from './PaymentMethodForm.module.css';

interface PaymentMethodFormProps {
  value: PaymentFields;
  onChange: (next: PaymentFields) => void;
  amountDue: number;
  /** Restrict the method dropdown - defaults to every PAYMENT_METHODS value.
   * The cashier Transactions page passes COUNTER_PAYMENT_METHODS (no
   * GCash/Maya - those go through the customer's own online flow). */
  methods?: readonly string[];
}

/**
 * Issue #86: renders the correct minimal form per selected payment method -
 * Cash shows a tendered-amount field and computed change; Card/Bank
 * Transfer/Grabmart/Pickaroo show a reference-number field (Bank Transfer
 * additionally shows a BPI/BDO selector); GCash/Maya show a channel choice
 * ('pay via portal' waits on the PayMongo webhook, 'scan QR' is walk-in and
 * cashier-confirmed like every manual method) - see PaymentMethodForm.md
 * (Issue #83 dev notes) for why these are the same channel with two
 * different confirmation triggers.
 */
export function PaymentMethodForm({
  value,
  onChange,
  amountDue,
  methods = PAYMENT_METHODS,
}: PaymentMethodFormProps) {
  const isOnlineMethod = (ONLINE_PAYMENT_METHODS as readonly string[]).includes(
    value.payment_method
  );
  const isBankTransfer = value.payment_method === 'Bank Transfer';
  const isCash = value.payment_method === 'Cash';
  const showReference =
    !isCash && (!isOnlineMethod || value.online_channel === 'walk_in_qr');

  const change =
    isCash && value.cash_tendered !== undefined
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
          onChange={(event) =>
            onChange({
              ...value,
              payment_method: event.target
                .value as PaymentFields['payment_method'],
              bank_name: undefined,
              cash_tendered: undefined,
              online_channel: undefined,
            })
          }
        >
          {methods.map((method) => (
            <option key={method} value={method}>
              {method}
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

      {isCash ? (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Cash tendered (PHP)</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              step="0.01"
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

      {isOnlineMethod ? (
        <fieldset className={styles.radioGroup}>
          <legend className={styles.label}>Channel</legend>
          <label className={styles.radioOption}>
            <input
              type="radio"
              name="online_channel"
              checked={value.online_channel === 'portal'}
              onChange={() => onChange({ ...value, online_channel: 'portal' })}
            />
            Customer portal (waits for payment confirmation)
          </label>
          <label className={styles.radioOption}>
            <input
              type="radio"
              name="online_channel"
              checked={value.online_channel === 'walk_in_qr'}
              onChange={() =>
                onChange({ ...value, online_channel: 'walk_in_qr' })
              }
            />
            Scan QR at counter (cashier-confirmed)
          </label>
        </fieldset>
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
