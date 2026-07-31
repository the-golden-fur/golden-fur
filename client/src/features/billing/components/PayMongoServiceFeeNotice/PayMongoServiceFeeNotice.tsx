import { useEffect, useState } from 'react';
import { getPaymongoFeeRate } from '../../api/billing.api';
import {
  ONLINE_PAYMENT_METHODS,
  type PaymentMethod,
} from '../../billing.types';
import styles from './PayMongoServiceFeeNotice.module.css';

interface PayMongoServiceFeeNoticeProps {
  paymentMethod: PaymentMethod;
  accessToken: string;
}

/**
 * Issue #86 AC-4: inline, non-blocking notice shown before payment
 * confirmation for GCash/Maya only - fetches PayMongo's currently
 * configured rate from GET /billing/paymongo/fee-rate (getPaymongoServiceFeeRate
 * on the server) rather than hardcoding a percentage, per Issue #83's dev
 * notes. Unlike booking/components/PayMongoFeeNotice (Issue #58's earlier
 * placeholder, explicitly stubbed pending "Sprint 5's real M08 PayMongo
 * integration"), this one shows a real configured number - never alters the
 * total shown elsewhere on the checkout screen.
 */
export function PayMongoServiceFeeNotice({
  paymentMethod,
  accessToken,
}: PayMongoServiceFeeNoticeProps) {
  const [feePercent, setFeePercent] = useState<number | null>(null);
  const isOnlineMethod = (ONLINE_PAYMENT_METHODS as readonly string[]).includes(
    paymentMethod
  );

  useEffect(() => {
    if (!isOnlineMethod) return;

    let isMounted = true;
    void getPaymongoFeeRate(accessToken).then((result) => {
      if (isMounted && result.data !== null) {
        setFeePercent(result.data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOnlineMethod, accessToken]);

  if (!isOnlineMethod) {
    return null;
  }

  return (
    <p className={styles.notice} role="note">
      {paymentMethod} payments include a
      {feePercent !== null ? ` ${feePercent}%` : ''} online processing fee,
      charged by our payment partner in addition to the service total shown
      above - it does not change the amount recorded for this transaction.
    </p>
  );
}
