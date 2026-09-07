import { useState } from 'react';
import type { BookingDetails } from '../../booking.types';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { BookingStatusBadge } from '../shared/BookingStatusBadge/BookingStatusBadge';
import { PaymentStatusBadge } from '../shared/PaymentStatusBadge/PaymentStatusBadge';
import { NightTabs } from '../NightTabs/NightTabs';
import { getHotelNightDates } from '../../utils/hotelNights';
import styles from './BookingDetailsView.module.css';

interface BookingDetailsViewProps {
  data: BookingDetails;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Not yet';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** A row with stay_date unset applies to every night; a dated row applies
 * only to that night and wins over the dateless fallback - mirrors the
 * server's rowsForDate resolution, so this read-only view matches what
 * check-in / Care Log will actually show. Lifted from BookingDetailsPage. */
function rowsForNight<T extends { stay_date?: string }>(
  rows: T[],
  date: string | null
): T[] {
  if (date === null) return rows.filter((row) => !row.stay_date);
  const dated = rows.filter((row) => row.stay_date === date);
  return dated.length > 0 ? dated : rows.filter((row) => !row.stay_date);
}

function paymentChoiceLabel(choice: string | null): string {
  if (choice === 'downpayment') return 'Down payment';
  if (choice === 'balance') return 'Balance payment';
  return 'Full payment';
}

function CarePreferenceBlock({
  label,
  lines,
}: {
  label: string;
  lines: string[];
}) {
  return (
    <div>
      <p className={styles.copy}>
        <strong>{label}</strong>
      </p>
      {lines.length === 0 ? (
        <p className={styles.copy}>Not specified.</p>
      ) : (
        <ul className={styles.itemList}>
          {lines.map((line, index) => (
            <li key={index} className={styles.itemRow}>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Read-only presentational render of a fully-hydrated booking - shared by
 * the customer My Bookings modal (BookingDetailsModal) and the staff
 * Booking Details page (BookingDetailsPage). Pure: takes the resolved
 * BookingDetails from GET /bookings/:id/details, does no fetching. The only
 * local state is the Hotel care-instructions night tab.
 */
export function BookingDetailsView({ data }: BookingDetailsViewProps) {
  const { booking, pricing } = data;
  const [activeNightDate, setActiveNightDate] = useState<string | null>(null);

  const isHotel = booking.service_category === 'Hotel';
  const isGrouped = data.group !== null;
  const hotelNightDates = isHotel
    ? getHotelNightDates(
        booking.scheduled_start,
        Math.max(
          1,
          Math.round(
            (new Date(booking.scheduled_end).getTime() -
              new Date(booking.scheduled_start).getTime()) /
              (24 * 60 * 60 * 1000)
          )
        )
      )
    : [];
  const preferences = booking.hotel_preferences;

  const cageLabel = data.cage
    ? `${data.cage.cage_label} (${data.cage.size})`
    : isHotel
      ? 'Assigned at check-in'
      : '—';

  return (
    <div className={styles.content}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>{booking.service_category} booking</h3>
          <p className={styles.copy}>
            {data.pet?.name ?? 'Unknown pet'}
            {data.owner ? ` · ${data.owner.full_name}` : ''}
          </p>
        </div>
        <div className={styles.badgeGroup}>
          <BookingStatusBadge status={booking.status} />
          <PaymentStatusBadge status={booking.payment_status} />
        </div>
      </div>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Schedule</h4>
        <dl className={styles.detailGrid}>
          <div className={styles.detailRow}>
            <dt>Branch</dt>
            <dd>{data.branch?.name ?? '—'}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>Scheduled</dt>
            <dd>
              {formatDateTime(booking.scheduled_start)} —{' '}
              {formatDateTime(booking.scheduled_end)}
            </dd>
          </div>
          <div className={styles.detailRow}>
            <dt>Assigned staff</dt>
            <dd>{data.assigned_staff?.display_name ?? 'Not assigned'}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>Cage</dt>
            <dd>{cageLabel}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>Booked on</dt>
            <dd>{formatDateTime(booking.created_at)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Items</h4>
        {data.items.length === 0 ? (
          <p className={styles.copy}>No items recorded for this booking.</p>
        ) : (
          <ul className={styles.itemList}>
            {data.items.map((item) => (
              <li key={item.id} className={styles.itemRow}>
                <span>{item.name}</span>
                <span>{formatCurrency(item.price_at_booking)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isHotel && preferences ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Care instructions</h4>
          <p className={styles.copy}>
            Read-only — captured from the booking. Staff still confirm and edit
            everything at physical check-in.
          </p>

          {hotelNightDates.length > 0 ? (
            <NightTabs
              nights={hotelNightDates}
              activeDate={activeNightDate}
              onSelect={setActiveNightDate}
            />
          ) : null}

          <CarePreferenceBlock
            label="Feeding"
            lines={rowsForNight(preferences.feeding, activeNightDate).map(
              (row) => `${row.meal_time} — ${row.food_type} (${row.quantity})`
            )}
          />
          <CarePreferenceBlock
            label="Walking"
            lines={rowsForNight(preferences.walking, activeNightDate).map(
              (row) => `${row.time_block} — ${row.duration_minutes} min`
            )}
          />
          <CarePreferenceBlock
            label="Playtime"
            lines={rowsForNight(preferences.playing, activeNightDate).map(
              (row) => `${row.time_block} — ${row.duration_minutes} min`
            )}
          />
          <CarePreferenceBlock
            label="Medications"
            lines={rowsForNight(preferences.medications, activeNightDate).map(
              (row) =>
                `${row.medication_name} — ${row.dose}` +
                (row.scheduled_times.length > 0
                  ? ` (${row.scheduled_times.join(', ')})`
                  : '')
            )}
          />
        </section>
      ) : null}

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Pricing</h4>
        {isGrouped ? (
          <p className={styles.copy}>
            Part of a bundled booking — the discount, promo, total and payments
            below are shared across every booking in the group.
          </p>
        ) : null}
        <dl className={styles.detailGrid}>
          <div className={styles.detailRow}>
            <dt>{isGrouped ? "This booking's services" : 'Subtotal'}</dt>
            <dd>{formatCurrency(pricing.items_subtotal)}</dd>
          </div>
          {pricing.discount_amount > 0 ? (
            <div className={styles.detailRow}>
              <dt>
                {isGrouped ? 'Bundle discount' : 'Discount'}
                {data.discount_name ? ` (${data.discount_name})` : ''}
              </dt>
              <dd>-{formatCurrency(pricing.discount_amount)}</dd>
            </div>
          ) : null}
          {pricing.promo_amount > 0 ? (
            <div className={styles.detailRow}>
              <dt>
                {isGrouped ? 'Bundle promo' : 'Promo'}
                {data.promo_name ? ` (${data.promo_name})` : ''}
              </dt>
              <dd>-{formatCurrency(pricing.promo_amount)}</dd>
            </div>
          ) : null}
          <div className={styles.detailRowTotal}>
            <dt>{isGrouped ? 'Bundle total' : 'Total'}</dt>
            <dd>{formatCurrency(pricing.total)}</dd>
          </div>
          {pricing.downpayment_amount !== null ? (
            <div className={styles.detailRow}>
              <dt>{isGrouped ? 'Bundle down payment' : 'Down payment'}</dt>
              <dd>{formatCurrency(pricing.downpayment_amount)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {data.payments_visible ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Payments</h4>
          {data.transactions.length === 0 ? (
            <p className={styles.copy}>
              No payments recorded yet for this booking.
            </p>
          ) : (
            <ul className={styles.itemList}>
              {data.transactions.map((transaction) => (
                <li key={transaction.id} className={styles.paymentRow}>
                  <div className={styles.itemRow}>
                    <span>
                      {paymentChoiceLabel(transaction.payment_choice)}
                    </span>
                    <span>{formatCurrency(transaction.total_amount)}</span>
                  </div>
                  <span className={styles.paymentMeta}>
                    {formatDateTime(transaction.created_at)}
                    {transaction.payment_method
                      ? ` · ${transaction.payment_method}`
                      : ''}{' '}
                    · {transaction.payment_status}
                    {transaction.payment_reference
                      ? ` · Ref ${transaction.payment_reference}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <dl className={styles.detailGrid}>
            <div className={styles.detailRow}>
              <dt>Paid</dt>
              <dd>{formatCurrency(pricing.amount_paid)}</dd>
            </div>
            <div className={styles.detailRowTotal}>
              <dt>Remaining balance</dt>
              <dd>{formatCurrency(pricing.balance_due)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Status timeline</h4>
        <dl className={styles.detailGrid}>
          <div className={styles.detailRow}>
            <dt>Started</dt>
            <dd>{formatDateTime(booking.started_at)}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>Completed</dt>
            <dd>{formatDateTime(booking.completed_at)}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>Paid</dt>
            <dd>{formatDateTime(booking.paid_at)}</dd>
          </div>
          {booking.cancelled_at ? (
            <div className={styles.detailRow}>
              <dt>Cancelled</dt>
              <dd>
                {formatDateTime(booking.cancelled_at)}
                {booking.cancellation_reason
                  ? ` — ${booking.cancellation_reason}`
                  : ''}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {booking.special_instructions ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Special instructions</h4>
          <p className={styles.copy}>{booking.special_instructions}</p>
        </section>
      ) : null}
    </div>
  );
}
