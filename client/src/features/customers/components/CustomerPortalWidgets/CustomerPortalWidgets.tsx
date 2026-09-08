import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CalendarPlus, PawPrint, Receipt, Wallet } from 'lucide-react';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { useCreditBalance } from '../../../credits/providers/useCreditBalance';
import { listNotifications } from '../../../notifications/api/notifications.api';
import type { Notification } from '../../../notifications/notifications.types';
import { listCustomerPets } from '../../api/customer.api';
import type { Pet } from '../../customer.types';
import styles from './CustomerPortalWidgets.module.css';

interface CustomerPortalWidgetsProps {
  customerId: string;
  accessToken: string;
}

const BOARD_LIMIT = 6;
const PET_CHIP_LIMIT = 5;

function formatTimestamp(createdAt: string): string {
  return new Date(createdAt).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Customer portal home dashboard, rendered under the "Welcome back" heading
 * (CustomerPortalPage). A full-height notification board fills the left
 * column; a 2x2 grid on the right holds My Pets, Book a Service, View
 * Transactions and Credits. Each grid tile links to its dedicated page - the
 * portal home stays a jumping-off point, not a second copy of those pages.
 */
export function CustomerPortalWidgets({
  customerId,
  accessToken,
}: CustomerPortalWidgetsProps) {
  return (
    <div className={styles.layout}>
      <NotificationBoardWidget accessToken={accessToken} />

      <div className={styles.grid}>
        <MyPetsWidget customerId={customerId} accessToken={accessToken} />

        <Link to="/portal/book" className={styles.actionCard}>
          <span className={styles.actionIcon}>
            <CalendarPlus size={24} aria-hidden="true" />
          </span>
          <span className={styles.actionLabel}>Book a Service</span>
          <span className={styles.actionHint}>
            Grooming, hotel, daycare or vet
          </span>
        </Link>

        <Link to="/portal/transactions" className={styles.actionCard}>
          <span className={styles.actionIcon}>
            <Receipt size={24} aria-hidden="true" />
          </span>
          <span className={styles.actionLabel}>View Transactions</span>
          <span className={styles.actionHint}>
            Payment history and due payments
          </span>
        </Link>

        <CreditsWidget />
      </div>
    </div>
  );
}

function NotificationBoardWidget({ accessToken }: { accessToken: string }) {
  const [notifications, setNotifications] = useState<Notification[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;

    void listNotifications(accessToken).then((result) => {
      if (!isMounted) return;

      if (result.error) {
        setError(result.error);
        return;
      }

      // 'message_received' rows are represented by the thread itself in the
      // inbox - keep them off this board too, matching NotificationsPage.
      setNotifications(
        (result.data ?? []).filter(
          (notification) => notification.event_type !== 'message_received'
        )
      );
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Notification Board</h2>
        <Link to="/portal/notifications" className={styles.viewAll}>
          View all
        </Link>
      </div>

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : notifications === null ? (
        <p className={styles.copy}>Loading notifications...</p>
      ) : notifications.length === 0 ? (
        <p className={styles.copy}>You&apos;re all caught up - no notices.</p>
      ) : (
        <ul className={styles.boardList}>
          {notifications.slice(0, BOARD_LIMIT).map((notification) => (
            <li key={notification.id}>
              <Link
                to={`/portal/notifications?open=${notification.id}`}
                className={
                  notification.is_read
                    ? styles.boardRow
                    : `${styles.boardRow} ${styles.boardRowUnread}`
                }
              >
                <span className={styles.boardTitle}>{notification.title}</span>
                <p className={styles.boardMessage}>{notification.message}</p>
                <span className={styles.boardTime}>
                  {formatTimestamp(notification.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MyPetsWidget({
  customerId,
  accessToken,
}: {
  customerId: string;
  accessToken: string;
}) {
  const [pets, setPets] = useState<Pet[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId || !accessToken) return;

    let isMounted = true;

    void listCustomerPets(customerId, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.error) {
        setError(result.error);
        return;
      }

      setPets((result.data ?? []).filter((pet) => pet.is_active));
    });

    return () => {
      isMounted = false;
    };
  }, [customerId, accessToken]);

  const extraCount = pets ? Math.max(0, pets.length - PET_CHIP_LIMIT) : 0;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>My Pets</h2>
        <Link to="/portal/pets" className={styles.viewAll}>
          Manage
        </Link>
      </div>

      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : pets === null ? (
        <p className={styles.copy}>Loading pets...</p>
      ) : pets.length === 0 ? (
        <p className={styles.copy}>No pets yet - add one from Pet Manager.</p>
      ) : (
        <ul className={styles.petList}>
          {pets.slice(0, PET_CHIP_LIMIT).map((pet) => (
            <li key={pet.id} className={styles.petChip}>
              <PawPrint size={14} aria-hidden="true" />
              {pet.name}
            </li>
          ))}
          {extraCount > 0 ? (
            <li className={styles.petChip}>+{extraCount} more</li>
          ) : null}
        </ul>
      )}
    </section>
  );
}

function CreditsWidget() {
  const { total, balances, isLoading } = useCreditBalance();
  const fundedBranches = balances.filter(
    (balance) => balance.balance > 0
  ).length;

  return (
    <Link to="/portal/credits" className={styles.actionCard}>
      <span className={styles.actionIcon}>
        <Wallet size={24} aria-hidden="true" />
      </span>
      <span className={styles.actionLabel}>Account Credit</span>
      {isLoading ? (
        <span className={styles.actionHint}>Loading balance...</span>
      ) : (
        <>
          <p className={styles.creditAmount}>{formatCurrency(total)}</p>
          <span className={styles.actionHint}>
            {total > 0
              ? `Across ${fundedBranches} ${
                  fundedBranches === 1 ? 'branch' : 'branches'
                }`
              : 'No credit yet'}
          </span>
        </>
      )}
    </Link>
  );
}
