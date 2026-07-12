import { useState, type FormEvent } from 'react';
import { signup } from '../../../../auth/customer/api/customerAuth.api';
import {
  listCustomers,
  updateCustomerProfile,
} from '../../../../customers/api/customer.api';
import type {
  CommunicationChannel,
  CustomerProfile,
} from '../../../../customers/customer.types';
import styles from './NewWalkInCustomerForm.module.css';

const COMMUNICATION_CHANNELS: CommunicationChannel[] = [
  'Call',
  'Text',
  'Viber',
  'Messenger',
];

interface NewWalkInCustomerFormProps {
  accessToken: string;
  onSaved: (customer: CustomerProfile) => void;
}

/**
 * Walk-in customers don't set a password at intake; they can use "forgot
 * password" later if they want portal access. This only satisfies the
 * existing customer signup endpoint's (Epic A) required field.
 */
function generateTemporaryPassword(): string {
  return `Walkin-${crypto.randomUUID()}`;
}

/**
 * Implements Modules-Features M02 Process 2: enter customer details, check
 * for an existing account by email, and if one exists, show it and offer to
 * update it instead of creating a duplicate. Reuses Issue #31's staff-facing
 * GET /customers?email= lookup for the check, Issue #31's PATCH for the
 * update path, and Epic A's existing customer signup endpoint (via the
 * client's customerAuth.api.ts) for the create path - Issue #35 adds no new
 * server-side routes of its own.
 */
export function NewWalkInCustomerForm({
  accessToken,
  onSaved,
}: NewWalkInCustomerFormProps) {
  const [fullName, setFullName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactNumber, setEmergencyContactNumber] = useState('');
  const [commsChannel, setCommsChannel] = useState<CommunicationChannel | ''>(
    ''
  );
  const [existingCustomer, setExistingCustomer] =
    useState<CustomerProfile | null>(null);
  const [hasChecked, setHasChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setFullName('');
    setAccountEmail('');
    setContactNumber('');
    setEmergencyContactName('');
    setEmergencyContactNumber('');
    setCommsChannel('');
    setExistingCustomer(null);
    setHasChecked(false);
  };

  const handleCheck = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!fullName.trim() || !accountEmail.trim()) {
      setError('Full name and email are required.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const result = await listCustomers(accessToken, accountEmail.trim());
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    const match = result.data?.[0] ?? null;
    setExistingCustomer(match);
    setHasChecked(true);

    if (match) {
      setFullName(match.full_name);
      setContactNumber(match.contact_number ?? '');
      setEmergencyContactName(match.emergency_contact_name ?? '');
      setEmergencyContactNumber(match.emergency_contact_number ?? '');
      setCommsChannel(match.preferred_communication_channel ?? '');
    }
  };

  const handleConfirm = async () => {
    setError(null);
    setIsSubmitting(true);

    if (existingCustomer) {
      const result = await updateCustomerProfile(
        existingCustomer.id,
        accessToken,
        {
          full_name: fullName,
          contact_number: contactNumber,
          emergency_contact_name: emergencyContactName,
          emergency_contact_number: emergencyContactNumber,
          ...(commsChannel
            ? { preferred_communication_channel: commsChannel }
            : {}),
        }
      );
      setIsSubmitting(false);

      if (result.error || !result.data) {
        setError(result.error ?? 'Could not update customer.');
        return;
      }

      resetForm();
      onSaved(result.data);
      return;
    }

    const signupResult = await signup({
      full_name: fullName,
      account_email: accountEmail.trim(),
      password: generateTemporaryPassword(),
    });

    if (signupResult.error) {
      setIsSubmitting(false);
      setError(signupResult.error);
      return;
    }

    // Signup only creates the auth user + a bare customer_profiles row -
    // apply the rest of the intake details via the same staff-facing PATCH
    // used on the existing-account path, after looking the new row back up.
    const lookup = await listCustomers(accessToken, accountEmail.trim());
    const created = lookup.data?.[0] ?? null;
    setIsSubmitting(false);

    if (!created) {
      setError('Customer created, but could not load the new record.');
      return;
    }

    const patched = await updateCustomerProfile(created.id, accessToken, {
      ...(contactNumber ? { contact_number: contactNumber } : {}),
      ...(emergencyContactName
        ? { emergency_contact_name: emergencyContactName }
        : {}),
      ...(emergencyContactNumber
        ? { emergency_contact_number: emergencyContactNumber }
        : {}),
      ...(commsChannel
        ? { preferred_communication_channel: commsChannel }
        : {}),
    });

    resetForm();
    onSaved(patched.data ?? created);
  };

  if (hasChecked) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.copy}>
          {existingCustomer
            ? 'An account already exists for this email. Confirm to update it instead of creating a duplicate.'
            : 'No existing account found. Confirm to create a new customer.'}
        </p>
        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>Full name</span>
            <input
              className={styles.input}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Contact number</span>
            <input
              className={styles.input}
              value={contactNumber}
              onChange={(event) => setContactNumber(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Emergency contact name</span>
            <input
              className={styles.input}
              value={emergencyContactName}
              onChange={(event) => setEmergencyContactName(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Emergency contact number</span>
            <input
              className={styles.input}
              value={emergencyContactNumber}
              onChange={(event) =>
                setEmergencyContactNumber(event.target.value)
              }
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Preferred communication</span>
            <select
              className={styles.input}
              value={commsChannel}
              onChange={(event) =>
                setCommsChannel(event.target.value as CommunicationChannel)
              }
            >
              <option value="">Select a channel</option>
              {COMMUNICATION_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <p className={styles.errorBanner} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              disabled={isSubmitting}
              onClick={() => void handleConfirm()}
            >
              {isSubmitting
                ? 'Saving...'
                : existingCustomer
                  ? 'Update customer'
                  : 'Create customer'}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={resetForm}
            >
              Start over
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={(event) => void handleCheck(event)}>
      <label className={styles.field}>
        <span className={styles.label}>Full name</span>
        <input
          className={styles.input}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Email</span>
        <input
          className={styles.input}
          type="email"
          value={accountEmail}
          onChange={(event) => setAccountEmail(event.target.value)}
        />
      </label>
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}
      <button className={styles.button} type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Checking...' : 'Check account'}
      </button>
    </form>
  );
}
