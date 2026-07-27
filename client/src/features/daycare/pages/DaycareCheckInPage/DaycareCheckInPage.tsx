import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import {
  getPet,
  listCustomerPets,
  listCustomers,
} from '../../../customers/api/customer.api';
import { PetForm } from '../../../customers/components/forms/PetForm/PetForm';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import { listBookings } from '../../../booking/api/booking.api';
import type { Booking } from '../../../booking/booking.types';
import { checkInDaycareSession } from '../../api/daycare.api';
import styles from './DaycareCheckInPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type Mode = 'booking' | 'walkin';

/**
 * Issue #69: check-in accepts either path (AC-1) - an existing confirmed
 * Daycare booking looked up for today, or a brand-new walk-in session
 * (existing pet from an M02 profile, or a freshly-registered one reusing
 * PetForm unmodified, per the dev notes).
 */
export function DaycareCheckInPage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [branchId, setBranchId] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('booking');

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [petNames, setPetNames] = useState<Record<string, string>>({});
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(
    null
  );

  const [emailQuery, setEmailQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerProfile | null>(null);
  const [customerPets, setCustomerPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [isRegisteringPet, setIsRegisteringPet] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [checkedInSessionId, setCheckedInSessionId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setRoleStatus(
          ALLOWED_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
        );
        setBranchId(result.data.branch_id);
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken || !branchId) return;

    let isMounted = true;

    void listBookings(accessToken, {
      branchId,
      date: todayIso(),
      serviceCategory: 'Daycare',
      status: 'Confirmed',
    }).then((result) => {
      if (!isMounted) return;

      setIsLoadingBookings(false);

      if (!result.data) return;

      setBookings(result.data);

      void Promise.all(
        result.data.map((booking) => getPet(booking.pet_id, accessToken))
      ).then((petResults) => {
        if (!isMounted) return;
        setPetNames((prev) => {
          const next = { ...prev };
          for (const petResult of petResults) {
            if (petResult.data) next[petResult.data.id] = petResult.data.name;
          }
          return next;
        });
      });
    });

    return () => {
      isMounted = false;
    };
  }, [roleStatus, accessToken, branchId]);

  function handleSearchCustomers() {
    if (!accessToken) return;

    void listCustomers(accessToken, emailQuery.trim() || undefined).then(
      (result) => {
        setCustomers(result.data ?? []);
      }
    );
  }

  function handleSelectCustomer(customer: CustomerProfile) {
    if (!accessToken) return;

    setSelectedCustomer(customer);
    setSelectedPetId(null);
    setIsRegisteringPet(false);

    void listCustomerPets(customer.id, accessToken).then((result) => {
      setCustomerPets(result.data ?? []);
    });
  }

  function handlePetRegistered(pet: Pet) {
    setCustomerPets((prev) => [...prev, pet]);
    setSelectedPetId(pet.id);
    setIsRegisteringPet(false);
  }

  async function submitCheckIn() {
    if (!accessToken) return;

    setSubmitError(null);
    setBlockedMessage(null);
    setIsSubmitting(true);

    const payload =
      mode === 'booking'
        ? { booking_id: selectedBookingId! }
        : { pet_id: selectedPetId!, branch_id: branchId! };

    const result = await checkInDaycareSession(accessToken, payload);

    setIsSubmitting(false);

    if (result.error || !result.data) {
      const message = result.error ?? 'Could not check in this pet.';
      // AC-3: a terminal state for the screen, not a retry loop - the
      // message stays until the user picks a different booking/pet.
      if (message.toLowerCase().includes('unavailable after')) {
        setBlockedMessage(message);
      } else {
        setSubmitError(message);
      }
      return;
    }

    setCheckedInSessionId(result.data.id);
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
      <div className={styles.content}>
        <p className={styles.errorBanner} role="alert">
          Unable to load Daycare check-in.
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
    return <Navigate to="/staff/profile" replace />;
  }

  if (checkedInSessionId) {
    return (
      <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Daycare Check-in</h1>
        <p className={styles.successBanner} role="status">
          Pet checked in successfully.
        </p>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() =>
              navigate(`/staff/daycare/checkout/${checkedInSessionId}`)
            }
          >
            Go to checkout
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setCheckedInSessionId(null)}
          >
            Check in another pet
          </button>
        </div>
      </div>
      </main>
    );
  }

  const canSubmit =
    (mode === 'booking' && Boolean(selectedBookingId)) ||
    (mode === 'walkin' && Boolean(selectedPetId));

  return (
    <main className={styles.page}>
      <div className={styles.content}>
      <h1 className={styles.title}>Daycare Check-in</h1>

      <div className={styles.tabs}>
        <button
          type="button"
          className={mode === 'booking' ? styles.tabActive : styles.tab}
          onClick={() => setMode('booking')}
        >
          Existing booking
        </button>
        <button
          type="button"
          className={mode === 'walkin' ? styles.tabActive : styles.tab}
          onClick={() => setMode('walkin')}
        >
          Walk-in
        </button>
      </div>

      {blockedMessage ? (
        <p className={styles.errorBanner} role="alert">
          {blockedMessage}
        </p>
      ) : null}
      {submitError ? (
        <p className={styles.errorBanner} role="alert">
          {submitError}
        </p>
      ) : null}

      {mode === 'booking' ? (
        <div className={styles.section}>
          {isLoadingBookings ? (
            <p className={styles.copy}>Loading today's Daycare bookings...</p>
          ) : bookings.length === 0 ? (
            <p className={styles.copy}>
              No confirmed Daycare bookings for today at this branch.
            </p>
          ) : (
            <ul className={styles.list}>
              {bookings.map((booking) => (
                <li key={booking.id}>
                  <label className={styles.radioRow}>
                    <input
                      type="radio"
                      name="booking"
                      checked={selectedBookingId === booking.id}
                      onChange={() => setSelectedBookingId(booking.id)}
                    />
                    {petNames[booking.pet_id] ?? 'Pet'} -{' '}
                    {new Date(booking.scheduled_start).toLocaleTimeString()}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className={styles.section}>
          <div className={styles.searchRow}>
            <input
              className={styles.input}
              type="email"
              placeholder="Customer email"
              value={emailQuery}
              onChange={(event) => setEmailQuery(event.target.value)}
            />
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleSearchCustomers}
            >
              Search
            </button>
          </div>

          {customers.length > 0 ? (
            <ul className={styles.list}>
              {customers.map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    className={
                      selectedCustomer?.id === customer.id
                        ? styles.rowButtonActive
                        : styles.rowButton
                    }
                    onClick={() => handleSelectCustomer(customer)}
                  >
                    {customer.full_name} ({customer.account_email})
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {selectedCustomer ? (
            <div className={styles.section}>
              {customerPets.length > 0 ? (
                <ul className={styles.list}>
                  {customerPets.map((pet) => (
                    <li key={pet.id}>
                      <label className={styles.radioRow}>
                        <input
                          type="radio"
                          name="pet"
                          checked={selectedPetId === pet.id}
                          onChange={() => setSelectedPetId(pet.id)}
                        />
                        {pet.name}
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.copy}>
                  This customer has no pets on file yet.
                </p>
              )}

              {isRegisteringPet ? (
                <PetForm
                  customerId={selectedCustomer.id}
                  accessToken={accessToken}
                  onCreated={handlePetRegistered}
                />
              ) : (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setIsRegisteringPet(true)}
                >
                  Register a new pet
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}

      <button
        type="button"
        className={styles.primaryButton}
        disabled={!canSubmit || isSubmitting}
        onClick={() => void submitCheckIn()}
      >
        {isSubmitting ? 'Checking in...' : 'Check in'}
      </button>
      </div>
    </main>
  );
}
