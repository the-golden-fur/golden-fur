import { useEffect, useState } from 'react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getCustomerProfile } from '../../api/customer.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import {
  listCreditBalances,
  listCreditHistory,
} from '../../../credits/api/credits.api';
import type {
  CreditBalance,
  CreditTransaction,
} from '../../../credits/credits.types';
import { CreditBalanceCard } from '../../../credits/components/CreditBalanceCard/CreditBalanceCard';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../../notifications/api/notifications.api';
import type { Notification } from '../../../notifications/notifications.types';
import { NotificationList } from '../../../notifications/components/NotificationList/NotificationList';
import styles from './CustomerPortalPage.module.css';

type PortalTab = 'overview' | 'notifications';

/**
 * The customer portal home (`/portal`, the Navbar brand link's destination)
 * - previously a tile grid linking to Book a Service/My Bookings/Pet
 * Manager/Settings, now redundant with the Sidebar (AppShell), which
 * already links to all of those (customerPortal.config.ts). Beyond the
 * welcome message, this is also where #95 surfaces the customer's own
 * credit balance (self-read via GET /credits/balances with no customer_id -
 * resolves to the caller) - one card per branch with a nonzero balance,
 * since credit is branch-locked and there's no cross-branch total to show.
 *
 * Issue #101: gains a Notifications tab, rendering through the same
 * NotificationList component #100's staff dropdown uses - scoped to the
 * customer's own inbox automatically (the shared GET /notifications
 * endpoint resolves recipient by caller identity, not a query param).
 */
export function CustomerPortalPage() {
  const { user, accessToken } = useAuth();
  const [fullName, setFullName] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [balances, setBalances] = useState<CreditBalance[]>([]);
  const [historyByBranch, setHistoryByBranch] = useState<
    Record<string, CreditTransaction[]>
  >({});
  const [activeTab, setActiveTab] = useState<PortalTab>('overview');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!user?.id || !accessToken) {
      return;
    }

    let isMounted = true;

    void getCustomerProfile(user.id, accessToken).then((result) => {
      if (isMounted && result.data) {
        setFullName(result.data.full_name);
      }
    });

    void listBranches().then((result) => {
      if (isMounted && result.data) setBranches(result.data);
    });

    void listCreditBalances(accessToken).then((result) => {
      if (!isMounted || !result.data) return;

      const withBalance = result.data.filter((balance) => balance.balance > 0);
      setBalances(withBalance);

      for (const balance of withBalance) {
        void listCreditHistory(accessToken, balance.branch_id).then(
          (historyResult) => {
            if (!isMounted || !historyResult.data) return;
            setHistoryByBranch((prev) => ({
              ...prev,
              [balance.branch_id]: historyResult.data!,
            }));
          }
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [user?.id, accessToken]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let isMounted = true;

    void listNotifications(accessToken).then((result) => {
      if (!isMounted) return;

      setNotificationsLoading(false);

      if (result.error) {
        setNotificationsError(result.error);
        return;
      }

      setNotifications(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  const branchName = (branchId: string) =>
    branches.find((branch) => branch.id === branchId)?.name ?? 'Unknown branch';

  async function handleSelectNotification(notification: Notification) {
    if (notification.is_read || !accessToken) {
      return;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id ? { ...item, is_read: true } : item
      )
    );

    await markNotificationRead(notification.id, accessToken);
  }

  async function handleMarkAllRead() {
    if (!accessToken) {
      return;
    }

    setNotifications((current) =>
      current.map((item) => ({ ...item, is_read: true }))
    );

    await markAllNotificationsRead(accessToken);
  }

  const unreadCount = notifications.filter((item) => !item.is_read).length;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>
        Welcome back{fullName ? `, ${fullName}` : ''}!
      </h1>

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          className={activeTab === 'overview' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'notifications'}
          className={
            activeTab === 'notifications' ? styles.tabActive : styles.tab
          }
          onClick={() => setActiveTab('notifications')}
        >
          Notifications
          {unreadCount > 0 ? ` (${unreadCount})` : ''}
        </button>
      </div>

      {activeTab === 'overview' ? (
        <>
          <p className={styles.copy}>
            Find everything you need in the sidebar.
          </p>

          {balances.length > 0 ? (
            <div className={styles.creditSection}>
              {balances.map((balance) => (
                <CreditBalanceCard
                  key={balance.id}
                  balance={balance}
                  branchName={branchName(balance.branch_id)}
                  history={historyByBranch[balance.branch_id] ?? []}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className={styles.notificationsSection}>
          <button
            type="button"
            className={styles.markAllButton}
            onClick={() => void handleMarkAllRead()}
            disabled={unreadCount === 0}
          >
            Mark all as read
          </button>
          <NotificationList
            notifications={notifications}
            isLoading={notificationsLoading}
            error={notificationsError}
            onSelect={(notification) =>
              void handleSelectNotification(notification)
            }
          />
        </div>
      )}
    </main>
  );
}
