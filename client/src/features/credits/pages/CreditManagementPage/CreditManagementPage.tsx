import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { CustomerPicker } from '../../../booking/components/CustomerPicker/CustomerPicker';
import type { CustomerProfile } from '../../../customers/customer.types';
import { listCreditBalances, listCreditHistory } from '../../api/credits.api';
import type { CreditBalance, CreditTransaction } from '../../credits.types';
import { CreditBalanceCard } from '../../components/CreditBalanceCard/CreditBalanceCard';
import { CreditHistoryTable } from '../../components/CreditHistoryTable/CreditHistoryTable';
import styles from './CreditManagementPage.module.css';

/** Cashier/Admin/Superadmin (#95 AC-3) - matches CREDIT_STAFF_ROLES
 * server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Cashier', 'Admin', 'Superadmin']);

/**
 * Issue #95: Cashier/Admin/Superadmin view of a customer's credit balance,
 * per-branch (credit is branch-locked - see credit_balances' UNIQUE
 * constraint), with expandable transaction history. Reuses the booking
 * flow's CustomerPicker for the search step rather than building a second
 * customer search UI.
 */
export function CreditManagementPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);

  const [balances, setBalances] = useState<CreditBalance[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);
  const [history, setHistory] = useState<CreditTransaction[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

  useEffect(() => {
    if (!isAllowedViewer) return;

    void listBranches().then((result) => {
      if (result.data) setBranches(result.data);
    });
  }, [isAllowedViewer]);

  useEffect(() => {
    if (!accessToken || !customer) return;

    let isMounted = true;

    void listCreditBalances(accessToken, customer.id).then((result) => {
      if (!isMounted) return;

      setIsLoadingBalances(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load credit balances.');
        return;
      }

      setLoadError(null);
      setBalances(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, customer]);

  const branchName = (branchId: string) =>
    branches.find((branch) => branch.id === branchId)?.name ?? 'Unknown branch';

  const handleChangeCustomer = () => {
    setCustomer(null);
    setBalances([]);
    setExpandedBranchId(null);
    setLoadError(null);
  };

  const handleSelectCustomer = (selected: CustomerProfile) => {
    setCustomer(selected);
    setIsLoadingBalances(true);
    setExpandedBranchId(null);
  };

  const toggleHistory = (branchId: string) => {
    if (expandedBranchId === branchId) {
      setExpandedBranchId(null);
      return;
    }

    setExpandedBranchId(branchId);

    if (!accessToken || !customer) return;

    setIsLoadingHistory(true);
    void listCreditHistory(accessToken, branchId, customer.id).then(
      (result) => {
        setIsLoadingHistory(false);
        if (result.data) setHistory(result.data);
      }
    );
  };

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load credit management.
          </p>
        </div>
      </main>
    );
  }

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (!isAllowedViewer) {
    return <Navigate to="/staff/dashboard" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Credit Management</h1>
        <p className={styles.copy}>
          Look up a customer's branch-locked credit balance, transaction
          history, and expiry dates.
        </p>

        {!customer ? (
          <CustomerPicker
            accessToken={accessToken}
            onSelect={handleSelectCustomer}
          />
        ) : (
          <>
            <div className={styles.selectedCustomer}>
              <span>{customer.full_name}</span>
              <button
                type="button"
                className={styles.changeButton}
                onClick={handleChangeCustomer}
              >
                Change customer
              </button>
            </div>

            {loadError ? (
              <p className={styles.errorBanner} role="alert">
                {loadError}
              </p>
            ) : null}

            {isLoadingBalances ? (
              <p className={styles.copy}>Loading balances...</p>
            ) : balances.length === 0 ? (
              <p className={styles.copy}>
                This customer has no credit balance at any branch.
              </p>
            ) : (
              <div className={styles.balancesGrid}>
                {balances.map((balance) => (
                  <div className={styles.balanceGroup} key={balance.id}>
                    <CreditBalanceCard
                      balance={balance}
                      branchName={branchName(balance.branch_id)}
                      history={
                        expandedBranchId === balance.branch_id ? history : []
                      }
                    />
                    <button
                      type="button"
                      className={styles.historyToggle}
                      onClick={() => toggleHistory(balance.branch_id)}
                    >
                      {expandedBranchId === balance.branch_id
                        ? 'Hide history'
                        : 'View history'}
                    </button>
                    {expandedBranchId === balance.branch_id ? (
                      isLoadingHistory ? (
                        <p className={styles.copy}>Loading history...</p>
                      ) : (
                        <CreditHistoryTable history={history} />
                      )
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
