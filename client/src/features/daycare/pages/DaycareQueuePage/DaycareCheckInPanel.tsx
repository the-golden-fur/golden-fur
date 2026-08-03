import { useState } from 'react';
import {
  listCustomerPets,
  listCustomers,
} from '../../../customers/api/customer.api';
import { PetForm } from '../../../customers/components/forms/PetForm/PetForm';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import type { Booking } from '../../../booking/booking.types';
import { DaycareBookingPicker } from '../../components/DaycareBookingPicker/DaycareBookingPicker';
import { checkInDaycareSession } from '../../api/daycare.api';
import styles from './DaycareCheckInPanel.module.css';

interface DaycareCheckInPanelProps {
  accessToken: string;
  branchId: string;
  /** Fires once a pet has been checked in, so the parent DaycareQueuePage
   * can switch to the Check Out tab with this session preselected. */
  onCheckedIn: (sessionId: string) => void;
}

type Mode = 'booking' | 'walkin';

/**
 * Issue #69: check-in accepts either path (AC-1) - an existing confirmed
 * Daycare booking looked up for today, or a brand-new walk-in session
 * (existing pet from an M02 profile, or a freshly-registered one reusing
 * PetForm unmodified, per the dev notes).
 *
 * Queue redesign: extracted from the former standalone DaycareCheckInPage
 * so it can render as a tab panel inside DaycareQueuePage (alongside
 * DaycareCheckoutPanel) instead of its own route - role gating and
 * accessToken/branchId now come from the parent's single role check rather
 * than being fetched again here.
 */
export function DaycareCheckInPanel({
  accessToken,
  branchId,
  onCheckedIn,
}: DaycareCheckInPanelProps) {
  const [mode, setMode] = useState<Mode>('booking');

  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

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

  function handleSearchCustomers() {
    void listCustomers(accessToken, emailQuery.trim() || undefined).then(
      (result) => {
        setCustomers(result.data ?? []);
      }
    );
  }

  function handleSelectCustomer(customer: CustomerProfile) {
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
    setSubmitError(null);
    setBlockedMessage(null);
    setIsSubmitting(true);

    const payload =
      mode === 'booking'
        ? { booking_id: selectedBooking!.id }
        : { pet_id: selectedPetId!, branch_id: branchId };

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

  if (checkedInSessionId) {
    return (
      <>
        <p className={styles.successBanner} role="status">
          Pet checked in successfully.
        </p>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => onCheckedIn(checkedInSessionId)}
          >
            Go to checkout
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              setCheckedInSessionId(null);
              setSelectedBooking(null);
              setSelectedPetId(null);
              setSelectedCustomer(null);
            }}
          >
            Check in another pet
          </button>
        </div>
      </>
    );
  }

  const canSubmit =
    (mode === 'booking' && Boolean(selectedBooking)) ||
    (mode === 'walkin' && Boolean(selectedPetId));

  return (
    <>
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
          <DaycareBookingPicker
            accessToken={accessToken}
            branchId={branchId}
            onSelect={setSelectedBooking}
            selectedBookingId={selectedBooking?.id ?? null}
          />
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
                  isStaff
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
    </>
  );
}
