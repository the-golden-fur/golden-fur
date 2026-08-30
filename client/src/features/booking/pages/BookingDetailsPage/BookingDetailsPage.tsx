import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import {
  getCustomerProfile,
  getPet,
} from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import { listDiscounts } from '../../../discounts/api/discounts.api';
import type { Discount } from '../../../discounts/discounts.types';
import {
  listBranches,
  listPackages,
  listPromos,
  listServices,
} from '../../../maintenance/api/maintenance.api';
import type {
  BranchSummary,
  Package,
  Promo,
  Service,
} from '../../../maintenance/maintenance.types';
import { getBooking } from '../../api/booking.api';
import type { Booking } from '../../booking.types';
import { BookingStatusBadge } from '../../components/shared/BookingStatusBadge/BookingStatusBadge';
import { PaymentStageBadge } from '../../components/shared/PaymentStageBadge/PaymentStageBadge';
import { BookingPaymentsPanel } from '../../../billing/components/BookingPaymentsPanel/BookingPaymentsPanel';
import { NightTabs } from '../../components/NightTabs/NightTabs';
import { getHotelNightDates } from '../../utils/hotelNights';
import styles from './BookingDetailsPage.module.css';

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Not yet';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatCurrency(amount: number): string {
  return `PHP ${amount.toFixed(2)}`;
}

/** A row with stay_date unset applies to every night; a dated row applies
 * only to that night, and wins over the dateless fallback when both would
 * otherwise apply - mirrors the server's own rowsForDate resolution
 * (hotel/services/careInstructions.service.ts) used to generate each day's
 * real Care Log entries, so this read-only view matches what check-in/Care
 * Log will actually show once the stay exists. */
function rowsForNight<T extends { stay_date?: string }>(
  rows: T[],
  date: string | null
): T[] {
  if (date === null) return rows.filter((row) => !row.stay_date);
  const dated = rows.filter((row) => row.stay_date === date);
  return dated.length > 0 ? dated : rows.filter((row) => !row.stay_date);
}

/**
 * Issue: Bookings Queue's "View details" link, requested after the multi-
 * item rollout made the queue's row summary (one line, no item breakdown)
 * insufficient to see what was actually booked. Read-only - no status/
 * reschedule/cancel actions here, those stay on the queue list itself.
 */
export function BookingDetailsPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { accessToken } = useAuth();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pet, setPet] = useState<Pet | null>(null);
  const [owner, setOwner] = useState<CustomerProfile | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [activeNightDate, setActiveNightDate] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId || !accessToken) return;

    let isMounted = true;

    void getBooking(bookingId, accessToken).then((result) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load this booking.');
        return;
      }

      setBooking(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [bookingId, accessToken]);

  // Resolves everything the booking only stores as an id (pet, owner,
  // branch, service/package names, discount/promo names) - mirrors the name-
  // lookup-map pattern ReceptionistBookingsQueuePage and HotelBookingPicker
  // already use, just gathered here in one page instead of a list row.
  useEffect(() => {
    if (!booking || !accessToken) return;

    let isMounted = true;

    void getPet(booking.pet_id, accessToken).then((result) => {
      if (isMounted && result.data) setPet(result.data);
    });

    void getCustomerProfile(booking.customer_id, accessToken).then((result) => {
      if (isMounted && result.data) setOwner(result.data);
    });

    void listBranches().then((result) => {
      if (isMounted && result.data) setBranches(result.data);
    });

    void listServices(accessToken, {
      branchId: booking.branch_id,
      includeInactive: true,
    }).then((result) => {
      if (isMounted && result.data) setServices(result.data);
    });

    void listPackages(accessToken, {
      branchId: booking.branch_id,
      includeInactive: true,
    }).then((result) => {
      if (isMounted && result.data) setPackages(result.data);
    });

    if (booking.selected_discount_id) {
      void listDiscounts(accessToken, { branchId: booking.branch_id }).then(
        (result) => {
          if (isMounted && result.data) setDiscounts(result.data);
        }
      );
    }

    if (booking.selected_promo_id) {
      void listPromos(accessToken, { includeInactive: true }).then((result) => {
        if (isMounted && result.data) setPromos(result.data);
      });
    }

    return () => {
      isMounted = false;
    };
  }, [booking, accessToken]);

  const serviceNameById = useMemo(
    () => new Map(services.map((service) => [service.id, service.name])),
    [services]
  );
  const packageNameById = useMemo(
    () => new Map(packages.map((pkg) => [pkg.id, pkg.name])),
    [packages]
  );
  const branchNameById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches]
  );
  const discountName = useMemo(
    () =>
      discounts.find(
        (discount) => discount.id === booking?.selected_discount_id
      )?.name ?? null,
    [discounts, booking?.selected_discount_id]
  );
  const promoName = useMemo(
    () =>
      promos.find((promo) => promo.id === booking?.selected_promo_id)?.name ??
      null,
    [promos, booking?.selected_promo_id]
  );

  if (!bookingId || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load this booking.
          </p>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading booking...</p>
        </div>
      </main>
    );
  }

  if (loadError || !booking) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            {loadError ?? 'Booking not found.'}
          </p>
          <Link to="/staff/bookings/queue" className={styles.secondaryButton}>
            Back to queue
          </Link>
        </div>
      </main>
    );
  }

  const items = booking.booking_items ?? [];
  const itemsSubtotal = items.reduce(
    (sum, item) => sum + item.price_at_booking,
    0
  );

  // Hotel duration is always whole nights (HOTEL_ARRIVAL_STEP_MS in
  // availability.service.ts) - derived from the booking's own scheduled
  // range rather than stored separately.
  const hotelNightDates =
    booking.service_category === 'Hotel'
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

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <Link to="/staff/bookings/queue" className={styles.secondaryButton}>
          Back to queue
        </Link>

        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{booking.service_category} booking</h1>
            <p className={styles.copy}>
              {pet?.name ?? 'Unknown pet'} - Owner{' '}
              {owner?.full_name ?? 'Unknown owner'}
            </p>
          </div>
          <div className={styles.badgeGroup}>
            <BookingStatusBadge status={booking.status} />
            <PaymentStageBadge stage={booking.payment_stage} />
          </div>
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Schedule</h2>
          <dl className={styles.detailGrid}>
            <div className={styles.detailRow}>
              <dt>Branch</dt>
              <dd>{branchNameById.get(booking.branch_id) ?? 'Branch'}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Scheduled</dt>
              <dd>
                {formatDateTime(booking.scheduled_start)} -{' '}
                {formatDateTime(booking.scheduled_end)}
              </dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Booked on</dt>
              <dd>{formatDateTime(booking.created_at)}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Items</h2>
          {items.length === 0 ? (
            <p className={styles.copy}>No items recorded for this booking.</p>
          ) : (
            <ul className={styles.itemList}>
              {items.map((item) => (
                <li key={item.id} className={styles.itemRow}>
                  <span>
                    {item.service_id
                      ? (serviceNameById.get(item.service_id) ?? 'Service')
                      : (packageNameById.get(item.package_id ?? '') ??
                        'Package')}
                  </span>
                  <span>{formatCurrency(item.price_at_booking)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {booking.service_category === 'Hotel' && preferences ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Care instructions</h2>
            <p className={styles.copy}>
              Read-only - captured from the booking. The receptionist still
              confirms/edits everything at physical check-in.
            </p>

            {hotelNightDates.length > 0 ? (
              <NightTabs
                nights={hotelNightDates}
                activeDate={activeNightDate}
                onSelect={setActiveNightDate}
              />
            ) : null}

            <div>
              <p className={styles.copy}>
                <strong>Feeding</strong>
              </p>
              {rowsForNight(preferences.feeding, activeNightDate).length ===
              0 ? (
                <p className={styles.copy}>Not specified.</p>
              ) : (
                <ul className={styles.itemList}>
                  {rowsForNight(preferences.feeding, activeNightDate).map(
                    (row, index) => (
                      <li key={index} className={styles.itemRow}>
                        <span>
                          {row.meal_time} - {row.food_type} ({row.quantity})
                        </span>
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>

            <div>
              <p className={styles.copy}>
                <strong>Walking</strong>
              </p>
              {rowsForNight(preferences.walking, activeNightDate).length ===
              0 ? (
                <p className={styles.copy}>Not specified.</p>
              ) : (
                <ul className={styles.itemList}>
                  {rowsForNight(preferences.walking, activeNightDate).map(
                    (row, index) => (
                      <li key={index} className={styles.itemRow}>
                        <span>
                          {row.time_block} - {row.duration_minutes} min
                        </span>
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>

            <div>
              <p className={styles.copy}>
                <strong>Playtime</strong>
              </p>
              {rowsForNight(preferences.playing, activeNightDate).length ===
              0 ? (
                <p className={styles.copy}>Not specified.</p>
              ) : (
                <ul className={styles.itemList}>
                  {rowsForNight(preferences.playing, activeNightDate).map(
                    (row, index) => (
                      <li key={index} className={styles.itemRow}>
                        <span>
                          {row.time_block} - {row.duration_minutes} min
                        </span>
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>

            <div>
              <p className={styles.copy}>
                <strong>Medications</strong>
              </p>
              {rowsForNight(preferences.medications, activeNightDate).length ===
              0 ? (
                <p className={styles.copy}>Not specified.</p>
              ) : (
                <ul className={styles.itemList}>
                  {rowsForNight(preferences.medications, activeNightDate).map(
                    (row, index) => (
                      <li key={index} className={styles.itemRow}>
                        <span>
                          {row.medication_name} - {row.dose}
                          {row.scheduled_times.length > 0
                            ? ` (${row.scheduled_times.join(', ')})`
                            : ''}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Pricing</h2>
          <dl className={styles.detailGrid}>
            <div className={styles.detailRow}>
              <dt>Subtotal</dt>
              <dd>{formatCurrency(itemsSubtotal)}</dd>
            </div>
            {booking.selected_discount_id ? (
              <div className={styles.detailRow}>
                <dt>Discount{discountName ? ` (${discountName})` : ''}</dt>
                <dd>-{formatCurrency(booking.discount_amount)}</dd>
              </div>
            ) : null}
            {booking.selected_promo_id ? (
              <div className={styles.detailRow}>
                <dt>Promo{promoName ? ` (${promoName})` : ''}</dt>
                <dd>-{formatCurrency(booking.promo_amount)}</dd>
              </div>
            ) : null}
            <div className={styles.detailRowTotal}>
              <dt>Total</dt>
              <dd>{formatCurrency(booking.total_price)}</dd>
            </div>
            {booking.downpayment_amount !== null ? (
              <div className={styles.detailRow}>
                <dt>Downpayment</dt>
                <dd>{formatCurrency(booking.downpayment_amount)}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Payment</h2>
          <dl className={styles.detailGrid}>
            <div className={styles.detailRow}>
              <dt>Method</dt>
              <dd>{booking.payment_method ?? 'Not yet selected'}</dd>
            </div>
            <div className={styles.detailRow}>
              <dt>Confirmed</dt>
              <dd>{booking.payment_confirmed ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
          <BookingPaymentsPanel
            bookingId={booking.id}
            accessToken={accessToken}
          />
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Status timeline</h2>
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
                    ? ` - ${booking.cancellation_reason}`
                    : ''}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        {booking.special_instructions ? (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Special instructions</h2>
            <p className={styles.copy}>{booking.special_instructions}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
