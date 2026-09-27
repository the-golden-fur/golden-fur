import { useState } from 'react';
import { CustomerPicker } from '../../../booking/components/CustomerPicker/CustomerPicker';
import type { CustomerProfile } from '../../../customers/customer.types';
import styles from './MiscSaleWizard.module.css';

interface CustomerStepProps {
  accessToken: string;
  customer: CustomerProfile | null;
  onSelect: (customer: CustomerProfile) => void;
}

/**
 * Step 1 of the misc-sale wizard (session 115). No branch step precedes
 * this one - a misc sale is always recorded at the cashier's own branch
 * (server-derived via requireBranch, never client-chosen), so there is
 * nothing to filter the customer list by beyond what CustomerPicker already
 * loads for the logged-in staff member.
 */
export function CustomerStep({
  accessToken,
  customer,
  onSelect,
}: CustomerStepProps) {
  const [showPicker, setShowPicker] = useState(!customer);

  return (
    <div className={styles.field}>
      <span className={styles.label}>Customer</span>
      {customer && !showPicker ? (
        <div className={styles.selectedCustomer}>
          <span>{customer.full_name}</span>
          <button
            type="button"
            className={styles.smallButtonSecondary}
            onClick={() => setShowPicker(true)}
          >
            Change
          </button>
        </div>
      ) : (
        <CustomerPicker
          accessToken={accessToken}
          selectedCustomerId={customer?.id ?? null}
          onSelect={(selected) => {
            onSelect(selected);
            setShowPicker(false);
          }}
        />
      )}
    </div>
  );
}
