import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import logo from '../../../assets/logo.png';
import { encodeCode128 } from '../../utils/code128';
import { formatCurrency } from '../../utils/formatCurrency';
import styles from './TransactionReceiptPrintout.module.css';

export interface ReceiptLine {
  description: string;
  line_total: number;
}

export interface TransactionReceiptPrintoutProps {
  /** The branch the transaction was made at - its name, address and contact
   * number sit under the business name. Each line is left out when unknown. */
  branchName: string | null;
  branchAddress: string | null;
  branchContactNumber: string | null;
  /** "Receipt" for a settled transaction, "Payment Due" for one that isn't -
   * an unpaid transaction must never print as proof of payment. */
  title: string;
  /** Short transaction reference, unique to this transaction - shown under
   * the title and again as the barcode at the bottom. */
  reference: string;
  /** When the transaction was made (ISO). */
  date: string;
  customerName: string | null;
  petName: string | null;
  /** What was paid for - "Booking payment" or the misc sale's description. */
  description: string;
  service: string | null;
  /** "Down payment" / "Full payment" / "Balance payment", when there is one. */
  paymentLabel: string | null;
  /** Left out for a transaction that hasn't been paid yet. */
  method: string | null;
  statusLabel: string;
  amount: number;
  /** The bill's own lines (transaction_line_items) - e.g. a Daycare
   * checkout's overdue hours and night not picked up - printed above the
   * amount. Left out for a single-amount slip. */
  lines?: ReceiptLine[];
  /** Called once the browser's print dialog has closed, so the owner can
   * unmount this sheet again. */
  onDone: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// The sheet is mounted and printed in the same tick, which leaves no time to
// fetch the logo - so it is fetched as soon as a page that can print loads.
new Image().src = logo;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The lines to print, always adding up to `amount`: when they cover less
 * (a balance transaction that also carries what was still owed from booking,
 * which has no line of its own) a "Booking balance" line makes up the rest.
 */
function billLines(lines: ReceiptLine[], amount: number): ReceiptLine[] {
  const listed = round2(
    lines.reduce((sum, line) => sum + Number(line.line_total), 0)
  );
  const rest = round2(Number(amount) - listed);

  return rest > 0
    ? [{ description: 'Booking balance', line_total: rest }, ...lines]
    : lines;
}

/** Blank margin a scanner needs either side of the bars, in modules. */
const BARCODE_QUIET_ZONE = 10;

/**
 * The reference as a Code 128 barcode, so the transaction can be looked up
 * again by scanning the slip. Drawn as plain rectangles that stretch to the
 * sheet's width.
 */
function ReferenceBarcode({ value }: { value: string }) {
  const widths = encodeCode128(value);
  if (!widths) return null;

  const bars: { x: number; width: number }[] = [];
  let x = BARCODE_QUIET_ZONE;
  widths.forEach((width, index) => {
    // Even positions are bars, odd ones the spaces between them.
    if (index % 2 === 0) bars.push({ x, width });
    x += width;
  });

  return (
    <div className={styles.barcode}>
      <svg
        className={styles.barcodeBars}
        viewBox={`0 0 ${x + BARCODE_QUIET_ZONE} 10`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Barcode ${value}`}
      >
        {bars.map((bar) => (
          <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={10} />
        ))}
      </svg>
      <span className={styles.barcodeText}>{value}</span>
    </div>
  );
}

/**
 * The paper copy of one transaction a cashier hands the customer. An
 * acknowledgement of the payment, not an itemised or official receipt - a
 * transaction only carries the one amount.
 *
 * Same mounting as PrescriptionPrintout: only while a print is in progress,
 * and straight under <body> (a portal), hidden on screen - the print rule in
 * the stylesheet hides every other child of <body>. The owner mounts it and
 * calls window.print(); this component just reports back on `afterprint`.
 */
export function TransactionReceiptPrintout({
  branchName,
  branchAddress,
  branchContactNumber,
  title,
  reference,
  date,
  customerName,
  petName,
  description,
  service,
  paymentLabel,
  method,
  statusLabel,
  amount,
  lines,
  onDone,
}: TransactionReceiptPrintoutProps) {
  // Read through a ref so a new onDone identity on re-render never
  // re-subscribes mid-print.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const handleAfterPrint = () => onDoneRef.current();

    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  return createPortal(
    <div className={styles.sheet} role="document" aria-label={title}>
      <header className={styles.letterhead}>
        <p className={styles.brand}>
          <img className={styles.logo} src={logo} alt="" />
          <span>Golden Fur</span>
        </p>
        {branchName ? <p className={styles.branchName}>{branchName}</p> : null}
        {branchAddress ? (
          <p className={styles.branchLine}>{branchAddress}</p>
        ) : null}
        {branchContactNumber ? (
          <p className={styles.branchLine}>{branchContactNumber}</p>
        ) : null}
      </header>

      <h1 className={styles.title}>{title}</h1>

      <dl className={styles.details}>
        <div>
          <dt>Reference</dt>
          <dd>{reference}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{formatDate(date)}</dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>{customerName ?? '—'}</dd>
        </div>
        {petName ? (
          <div>
            <dt>Pet</dt>
            <dd>{petName}</dd>
          </div>
        ) : null}
      </dl>

      <dl className={`${styles.details} ${styles.item}`}>
        <div>
          <dt>Item</dt>
          <dd>{description}</dd>
        </div>
        {service ? (
          <div>
            <dt>Service</dt>
            <dd>{service}</dd>
          </div>
        ) : null}
        {paymentLabel ? (
          <div>
            <dt>Payment</dt>
            <dd>{paymentLabel}</dd>
          </div>
        ) : null}
        {method ? (
          <div>
            <dt>Method</dt>
            <dd>{method}</dd>
          </div>
        ) : null}
        <div>
          <dt>Status</dt>
          <dd>{statusLabel}</dd>
        </div>
      </dl>

      {lines && lines.length > 0 ? (
        <table className={styles.bill} aria-label="Bill">
          <tbody>
            {billLines(lines, amount).map((line, index) => (
              <tr key={`${line.description}-${index}`}>
                <td>{line.description}</td>
                <td className={styles.billAmount}>
                  {formatCurrency(line.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <p className={styles.total}>
        <span>Amount</span>
        <span>{formatCurrency(amount)}</span>
      </p>

      <p className={styles.thanks}>Thank you for choosing Golden Fur.</p>

      <ReferenceBarcode value={reference} />
    </div>,
    document.body
  );
}
