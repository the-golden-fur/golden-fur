import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';
import { listStaff } from '../../../staff/api/staff.api';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import { PET_DELETE_REASONS } from '../../../customers/pages/CustomerPetManagerPage/petDeleteReasons';
import { getTrendsReport } from '../../api/reports.api';
import type { TrendsReport, TrendsStaffRow } from '../../reports.types';
import { formatReportDay, isReportDay } from '../../utils/reportDay';
import { isGoalMonth } from '../../utils/goalMonth';
import {
  TRENDS_PRESETS,
  matchingMonth,
  matchingPreset,
  monthPeriod,
  presetPeriod,
  type TrendsPeriod,
} from '../../utils/trendsPeriod';
import { TrendsBarList, type TrendsBarRow } from './TrendsBarList';
import styles from './TrendsPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Supervisor', 'Superadmin']);

/** Always shown in the headline row, even at 0 - admins can add more pet
 * types, which then appear after these. */
const HEADLINE_PET_TYPES = ['Dog', 'Cat'];

/** Map -> bar rows, biggest first. */
function countRows(
  counts: Record<string, number>,
  labelFor: (key: string) => string = (key) => key
): TrendsBarRow[] {
  return Object.entries(counts)
    .map(([key, value]) => ({ key, label: labelFor(key), value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function staffRows(
  rows: TrendsStaffRow[],
  role: TrendsStaffRow['role']
): TrendsBarRow[] {
  return rows
    .filter((row) => row.role === role)
    .map((row) => ({
      key: row.staff_id ?? `unassigned-${role}`,
      label: row.display_name,
      value: row.bookings,
      note: `${row.completed} completed`,
      muted: row.staff_id === null,
    }));
}

function deleteReasonLabel(code: string): string {
  return (
    PET_DELETE_REASONS.find((reason) => reason.value === code)?.label ?? code
  );
}

/**
 * Custom change (Trends page): what's popular over a date range - dogs vs
 * cats, services, packages, how busy each groomer and vet is, and why
 * customers deleted pets (Pet Manager's delete reasons, 20261021275).
 * Admin/Supervisor see their own branch; Superadmin picks a branch or all of
 * them - same gate and branch toggle as the Booking Activity Report, and
 * enforced again server-side (GET /reports/trends + trends.service.ts).
 *
 * "Booked" counts bookings made in the range (not their service date),
 * cancelled ones left out - see get_trends() (20261021276).
 */
export function TrendsPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [viewerBranchId, setViewerBranchId] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [period, setPeriod] = useState<TrendsPeriod>(() =>
    presetPeriod('this-month')
  );

  const [report, setReport] = useState<TrendsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
      setViewerBranchId(self?.branch_id ?? null);
    });

    void listBranches().then((result) => {
      if (isMounted && result.data) setBranches(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);
  const isSuperadmin = viewerRole === 'Superadmin';

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) return;

    let isMounted = true;

    const branchId = isSuperadmin ? selectedBranchId || null : viewerBranchId;

    void getTrendsReport(period.from, period.to, branchId, accessToken).then(
      (result) => {
        if (!isMounted) return;

        setIsLoading(false);
        setError(result.error);
        if (result.data) setReport(result.data);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [
    accessToken,
    isAllowedViewer,
    isSuperadmin,
    selectedBranchId,
    viewerBranchId,
    period,
  ]);

  if (isRoleLoading) {
    return <LoadingState />;
  }

  if (!isAllowedViewer || !accessToken) {
    return <Navigate to="/staff/settings" replace />;
  }

  const branchName = (branchId: string) =>
    branches.find((branch) => branch.id === branchId)?.name ?? 'Your branch';

  const activePreset = matchingPreset(period);
  const activeMonth = matchingMonth(period) ?? '';

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Trends</h1>
        <p className={styles.subtitle}>
          {formatReportDay(period.from)} – {formatReportDay(period.to)}
          {' · '}
          {isSuperadmin
            ? selectedBranchId
              ? branchName(selectedBranchId)
              : 'All branches'
            : branchName(viewerBranchId ?? '')}
        </p>
      </header>

      <div className={styles.controls}>
        <div
          className={styles.presets}
          role="group"
          aria-label="Quick ranges"
        >
          {TRENDS_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={styles.presetButton}
              aria-pressed={activePreset === preset.value}
              onClick={() => setPeriod(presetPeriod(preset.value))}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <label className={styles.field}>
          Month
          <input
            className={styles.control}
            type="month"
            value={activeMonth}
            onChange={(event) => {
              if (isGoalMonth(event.target.value)) {
                setPeriod(monthPeriod(event.target.value));
              }
            }}
          />
        </label>

        <label className={styles.field}>
          From
          <input
            className={styles.control}
            type="date"
            value={period.from}
            max={period.to}
            onChange={(event) => {
              // Clearing the field gives '', which isn't a day to load.
              if (isReportDay(event.target.value)) {
                setPeriod((prev) => ({ ...prev, from: event.target.value }));
              }
            }}
          />
        </label>

        <label className={styles.field}>
          To
          <input
            className={styles.control}
            type="date"
            value={period.to}
            min={period.from}
            onChange={(event) => {
              if (isReportDay(event.target.value)) {
                setPeriod((prev) => ({ ...prev, to: event.target.value }));
              }
            }}
          />
        </label>

        {isSuperadmin ? (
          <label className={styles.field}>
            Branch
            <select
              className={styles.control}
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingState label="Loading trends..." />
      ) : error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : report ? (
        <TrendsContent report={report} />
      ) : null}
    </main>
  );
}

function TrendsContent({ report }: { report: TrendsReport }) {
  const petTypes = [
    ...HEADLINE_PET_TYPES,
    ...Object.keys(report.bookings_by_pet_type).filter(
      (type) => !HEADLINE_PET_TYPES.includes(type)
    ),
  ];
  const packagesBooked = report.packages_booked.reduce(
    (sum, row) => sum + row.count,
    0
  );

  const registeredTypes = [
    ...new Set([
      ...Object.keys(report.registered_pets_by_type),
      ...Object.keys(report.new_pets_by_type),
    ]),
  ];
  const registeredRows = registeredTypes
    .map((type) => ({
      key: type,
      label: type,
      value: report.registered_pets_by_type[type] ?? 0,
      note: `+${report.new_pets_by_type[type] ?? 0} new`,
    }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  return (
    <>
      <dl className={styles.headline}>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Bookings</dt>
          <dd className={styles.statValue}>{report.bookings_total}</dd>
        </div>
        {petTypes.map((type) => (
          <div key={type} className={styles.stat}>
            <dt className={styles.statLabel}>{type} bookings</dt>
            <dd className={styles.statValue}>
              {report.bookings_by_pet_type[type] ?? 0}
            </dd>
          </div>
        ))}
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Packages booked</dt>
          <dd className={styles.statValue}>{packagesBooked}</dd>
        </div>
      </dl>

      <p className={styles.note}>
        Counts bookings made in this period, not counting cancelled ones.
      </p>

      <div className={styles.panels}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Bookings by pet type</h2>
          <TrendsBarList
            label="Bookings by pet type"
            rows={countRows(report.bookings_by_pet_type)}
            emptyMessage="No bookings in this period."
          />
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Registered pets</h2>
          <p className={styles.panelHint}>
            Active pets on file, and how many were added in this period.
          </p>
          <TrendsBarList
            label="Registered pets"
            rows={registeredRows}
            emptyMessage="No pets on file."
          />
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Bookings by service</h2>
          <TrendsBarList
            label="Bookings by service"
            rows={countRows(report.bookings_by_category)}
            emptyMessage="No bookings in this period."
          />
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Top grooming services</h2>
          <TrendsBarList
            label="Top grooming services"
            rows={report.top_grooming_services.map((row) => ({
              key: row.name,
              label: row.name,
              value: row.count,
            }))}
            emptyMessage="No grooming services booked in this period."
          />
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Packages booked</h2>
          <TrendsBarList
            label="Packages booked"
            rows={report.packages_booked.map((row) => ({
              key: row.name,
              label: row.name,
              value: row.count,
            }))}
            emptyMessage="No packages booked in this period."
          />
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Groomers</h2>
          <TrendsBarList
            label="Bookings per groomer"
            rows={staffRows(report.staff_bookings, 'Groomer')}
            emptyMessage="No grooming bookings in this period."
          />
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Veterinarians</h2>
          <TrendsBarList
            label="Bookings per veterinarian"
            rows={staffRows(report.staff_bookings, 'Veterinarian')}
            emptyMessage="No veterinary bookings in this period."
          />
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Deleted pet reasons</h2>
          <TrendsBarList
            label="Deleted pet reasons"
            rows={countRows(report.deleted_pet_reasons, deleteReasonLabel)}
            emptyMessage="No pets deleted in this period."
          />
          {report.deleted_pet_other_notes.length > 0 ? (
            <>
              <h3 className={styles.notesTitle}>Latest “Other” reasons</h3>
              <ul className={styles.notes}>
                {report.deleted_pet_other_notes.map((note) => (
                  <li
                    key={`${note.archived_at}-${note.note}`}
                    className={styles.noteRow}
                  >
                    <span className={styles.noteText}>{note.note}</span>
                    <time
                      className={styles.noteDate}
                      dateTime={note.archived_at}
                    >
                      {new Date(note.archived_at).toLocaleDateString('en-PH', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}
