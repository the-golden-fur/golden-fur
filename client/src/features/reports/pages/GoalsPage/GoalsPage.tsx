import { useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { formatCurrency } from '../../../../shared/utils/formatCurrency';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { listStaff } from '../../../staff/api/staff.api';
import {
  getGoals,
  saveGoalGrowthRate,
  saveGoalTarget,
} from '../../api/reports.api';
import { GoalTable } from '../../components/GoalTable/GoalTable';
import type { GoalRow, GoalsReport } from '../../reports.types';
import {
  currentGoalMonth,
  formatGoalMonth,
  isGoalMonth,
  shiftGoalMonth,
} from '../../utils/goalMonth';
import styles from './GoalsPage.module.css';

/** '' in the branch select = every branch together. */
const ALL_BRANCHES = '';

function isMoney(row: GoalRow) {
  return row.key === 'revenue' || row.key.startsWith('revenue:');
}

function formatValue(value: number, row: GoalRow) {
  return isMoney(row) ? formatCurrency(value) : value.toLocaleString();
}

/**
 * Custom change (Goals page): every monthly goal in one place - appointments
 * booked, revenue, new customers, bookings and revenue per service, and
 * bookings per package - for any month, for one branch or all of them together. Each
 * line's goal is either an exact target typed for that month or the previous
 * month plus a growth %, both set from the row's Edit button.
 *
 * The package table is built from whatever packages exist, so a package
 * added in Package Builder shows up here on its own.
 *
 * Superadmin-only - gated here (Navigate away), in the sidebar config (tile
 * `roles`), and server-side (/reports/goals + goals.service.ts).
 */
export function GoalsPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [month, setMonth] = useState(() => currentGoalMonth());
  const [branchId, setBranchId] = useState(ALL_BRANCHES);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  // Bumped after a save, so the goals reload without changing month/branch.
  const [reloadKey, setReloadKey] = useState(0);

  // Tagged with what it was fetched for, so "loading" is derived (result is
  // for a different month/branch) rather than set inside the effect.
  const [result, setResult] = useState<{
    month: string;
    branchId: string;
    goals: GoalsReport | null;
    error: string | null;
  } | null>(null);

  const [editingRow, setEditingRow] = useState<GoalRow | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((staffResult) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = staffResult.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isSuperadmin = viewerRole === 'Superadmin';

  useEffect(() => {
    if (!isSuperadmin) return;

    let isMounted = true;

    void listBranches().then((branchesResult) => {
      if (isMounted) setBranches(branchesResult.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [isSuperadmin]);

  useEffect(() => {
    if (!accessToken || !isSuperadmin) return;

    let isMounted = true;

    void getGoals(month, branchId || null, accessToken).then((response) => {
      if (!isMounted) return;

      setResult({
        month,
        branchId,
        goals: response.data,
        error: response.error,
      });
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isSuperadmin, month, branchId, reloadKey]);

  if (isRoleLoading) {
    return <LoadingState />;
  }

  if (!isSuperadmin || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  const isLoading = result?.month !== month || result?.branchId !== branchId;
  const error = isLoading ? null : (result?.error ?? null);
  const goals = isLoading ? null : (result?.goals ?? null);

  const branchName =
    branches.find((branch) => branch.id === branchId)?.name ?? 'All branches';
  const monthLabel = formatGoalMonth(month);
  const previousMonthLabel = formatGoalMonth(shiftGoalMonth(month, -1));
  const isCurrentMonth = month === currentGoalMonth();

  const tableProps = {
    currentHeader: isCurrentMonth ? `${monthLabel} so far` : monthLabel,
    previousHeader: previousMonthLabel,
    format: formatValue,
    detailed: true,
    onEdit: setEditingRow,
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Supervisor · {branchName}</p>
          <h1 className={styles.title}>Goals</h1>
        </div>

        <div className={styles.controls}>
          <div className={styles.field}>
            <label htmlFor="goals-month">Month</label>
            <div className={styles.monthPicker}>
              <button
                type="button"
                className={styles.monthStep}
                onClick={() => setMonth(shiftGoalMonth(month, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <input
                id="goals-month"
                type="month"
                value={month}
                onChange={(event) => {
                  // Clearing the field gives '', which isn't a month to load.
                  if (isGoalMonth(event.target.value)) {
                    setMonth(event.target.value);
                  }
                }}
              />
              <button
                type="button"
                className={styles.monthStep}
                onClick={() => setMonth(shiftGoalMonth(month, 1))}
                aria-label="Next month"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <label className={styles.field}>
            Branch
            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              <option value={ALL_BRANCHES}>All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {isLoading ? (
        <LoadingState label="Loading goals..." />
      ) : error || !goals ? (
        <p className={styles.errorBanner} role="alert">
          {error ?? 'Could not load goals.'}
        </p>
      ) : (
        <>
          <GoalTable
            title="Overview"
            rows={[goals.appointments, goals.revenue, goals.new_customers]}
            firstColHeader="Metric"
            {...tableProps}
          />
          <div className={styles.split}>
            <GoalTable
              title="Appointments by service"
              rows={goals.services}
              firstColHeader="Service"
              {...tableProps}
            />
            <GoalTable
              title="Revenue by service"
              rows={goals.revenue_services}
              firstColHeader="Service"
              {...tableProps}
            />
          </div>
          <GoalTable
            title="Packages booked"
            rows={goals.packages}
            firstColHeader="Package"
            emptyMessage="No packages yet. A package added in Package Builder shows up here on its own."
            {...tableProps}
          />
          <p className={styles.copy}>
            Appointments, services and packages are counted by the date the
            booking was made. Revenue counts fully paid transactions; revenue by
            service leaves out counter sales, so it can add up to less than
            total revenue. A goal set for one branch is separate from the
            all-branches goal.
          </p>
        </>
      )}

      {editingRow ? (
        <GoalEditModal
          // Remount per row so the form starts from that row's own values.
          key={editingRow.key}
          row={editingRow}
          month={month}
          branchId={branchId || null}
          scopeLabel={branchName}
          accessToken={accessToken}
          onClose={() => setEditingRow(null)}
          onSaved={() => {
            setEditingRow(null);
            setReloadKey((current) => current + 1);
          }}
        />
      ) : null}
    </main>
  );
}

interface GoalEditModalProps {
  row: GoalRow;
  month: string;
  branchId: string | null;
  scopeLabel: string;
  accessToken: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Sets one metric's goal: a growth % that applies to every month, and an
 * optional exact target for the selected month, which wins over the %. */
function GoalEditModal({
  row,
  month,
  branchId,
  scopeLabel,
  accessToken,
  onClose,
  onSaved,
}: GoalEditModalProps) {
  const [growthRate, setGrowthRate] = useState(String(row.growth_rate));
  const [target, setTarget] = useState(
    row.target === null ? '' : String(row.target)
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const monthLabel = formatGoalMonth(month);
  const previousMonthLabel = formatGoalMonth(shiftGoalMonth(month, -1));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextGrowthRate = Number(growthRate);
    if (
      growthRate.trim() === '' ||
      !Number.isFinite(nextGrowthRate) ||
      nextGrowthRate < 0 ||
      nextGrowthRate > 1000
    ) {
      setFormError('Growth must be a percentage from 0 to 1000.');
      return;
    }

    const nextTarget = target.trim() === '' ? null : Number(target);
    if (
      nextTarget !== null &&
      (!Number.isFinite(nextTarget) || nextTarget < 0)
    ) {
      setFormError('The exact target must be 0 or more.');
      return;
    }
    if (nextTarget !== null && !isMoney(row) && !Number.isInteger(nextTarget)) {
      setFormError('The exact target must be a whole number.');
      return;
    }

    setFormError(null);
    setIsSaving(true);

    // Only what actually changed is saved, so opening and saving a row
    // doesn't pin it to today's default rate.
    if (nextGrowthRate !== row.growth_rate) {
      const saved = await saveGoalGrowthRate(
        { metricKey: row.key, branchId, growthRate: nextGrowthRate },
        accessToken
      );
      if (saved.error) {
        setIsSaving(false);
        setFormError(saved.error);
        return;
      }
    }

    if (nextTarget !== row.target) {
      const saved = await saveGoalTarget(
        { metricKey: row.key, branchId, month, targetValue: nextTarget },
        accessToken
      );
      if (saved.error) {
        setIsSaving(false);
        setFormError(saved.error);
        return;
      }
    }

    onSaved();
  }

  return (
    <Modal
      isOpen
      title={`Goal: ${row.label}`}
      onClose={onClose}
      closeOnBackdropClick={false}
    >
      <form
        className={styles.form}
        // Our own messages below, not the browser's, so they match the rest
        // of the app's forms.
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
      >
        <p className={styles.copy}>
          {scopeLabel} · {previousMonthLabel} was{' '}
          <strong>{formatValue(row.previous, row)}</strong>.
        </p>

        <label className={styles.formField}>
          <span className={styles.label}>
            Growth over the previous month (%)
          </span>
          <input
            className={styles.input}
            type="number"
            inputMode="decimal"
            min={0}
            max={1000}
            step="any"
            value={growthRate}
            onChange={(event) => setGrowthRate(event.target.value)}
          />
          <span className={styles.hint}>
            Used for every month that has no exact target.
          </span>
        </label>

        <label className={styles.formField}>
          <span className={styles.label}>Exact target for {monthLabel}</span>
          <input
            className={styles.input}
            type="number"
            inputMode="decimal"
            min={0}
            step={isMoney(row) ? 'any' : 1}
            placeholder="None"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          />
          <span className={styles.hint}>
            Optional. Overrides the growth % for {monthLabel} only. Leave blank
            to use the growth %.
          </span>
        </label>

        {formError ? (
          <p className={styles.errorBanner} role="alert">
            {formError}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className={styles.button} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save goal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
