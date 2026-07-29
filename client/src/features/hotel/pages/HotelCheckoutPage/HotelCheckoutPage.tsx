import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { checkOutHotelStay } from '../../api/hotel.api';
import { HotelStayPicker } from '../../components/HotelStayPicker/HotelStayPicker';
import type { CheckoutResult, HotelStayWithCage } from '../../hotel.types';
import styles from './HotelCheckoutPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * Issue #81 revision: a search/filter/sort picker (HotelStayPicker) over
 * active stays replaces the original raw "paste the stay id" text field -
 * manual testing flagged that as needlessly unfriendly given every other
 * hotel screen already has a proper picker. Arriving with a :stayId route
 * param (HotelCheckInPage's "Go to checkout" link, or HotelBookingPicker's
 * own checkout link for an already-checked-in booking) skips the picker
 * entirely and goes straight to the confirm step.
 *
 * The remaining balance is visually larger/bolder than the downpayment-
 * already-collected figure (AC-1/AC-2), so there's no ambiguity about which
 * number the future Sprint 5 cashier flow will collect.
 */
export function HotelCheckoutPage() {
  const { user, accessToken } = useAuth();
  const { stayId: routeStayId } = useParams<{ stayId?: string }>();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [selectedStay, setSelectedStay] = useState<HotelStayWithCage | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((profileResult) => {
      if (!isMounted) return;

      if (profileResult.data) {
        setRoleStatus(
          ALLOWED_VIEWER_ROLES.has(profileResult.data.role) ? 'ok' : 'denied'
        );
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  async function submitCheckout(stayId: string) {
    if (!accessToken) return;

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

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load Hotel checkout.
          </p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/settings" replace />;
  }

  if (result) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <h1 className={styles.title}>Hotel Checkout</h1>
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
            <div className={styles.breakdownRow}>
              <dt>Hotel-supplied items</dt>
              <dd>
                {result.suppliedItemsCharge === null
                  ? 'None'
                  : `₱${result.suppliedItemsCharge}`}
              </dd>
            </div>
            <div className={styles.breakdownTotal}>
              <dt>Remaining balance</dt>
              <dd>₱{result.remainingBalance}</dd>
            </div>
          </dl>
        </div>
      </main>
    );
  }

  // Reached via a direct link (HotelCheckInPage / HotelBookingPicker) with a
  // known stay id - skip the picker and go straight to confirm.
  if (routeStayId && !selectedStay) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <h1 className={styles.title}>Hotel Checkout</h1>

          {error ? (
            <p className={styles.errorBanner} role="alert">
              {error}
            </p>
          ) : null}

          <p className={styles.copy}>Ready to check out this stay?</p>

          <button
            type="button"
            className={styles.primaryButton}
            disabled={isSubmitting}
            onClick={() => void submitCheckout(routeStayId)}
          >
            {isSubmitting ? 'Checking out...' : 'Check out now'}
          </button>
        </div>
      </main>
    );
  }

  if (selectedStay) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <h1 className={styles.title}>Hotel Checkout</h1>

          <dl className={styles.breakdown}>
            <div className={styles.breakdownRow}>
              <dt>Cage</dt>
              <dd>{selectedStay.cage_label}</dd>
            </div>
            <div className={styles.breakdownRow}>
              <dt>Checkout due</dt>
              <dd>{formatDate(selectedStay.scheduled_check_out_date)}</dd>
            </div>
            <div className={styles.breakdownRow}>
              <dt>Downpayment already collected</dt>
              <dd>₱{selectedStay.downpayment_amount.toFixed(2)}</dd>
            </div>
          </dl>

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
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Hotel Checkout</h1>

        {error ? (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        ) : null}

        <HotelStayPicker accessToken={accessToken} onSelect={setSelectedStay} />
      </div>
    </main>
  );
}
