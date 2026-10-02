import type {
  BranchComparisonMetric,
  BranchComparisonRow,
} from '../../reports.types';

const PESO_FORMATTER = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const COUNT_FORMATTER = new Intl.NumberFormat('en-PH');

/** Fixed category order - rows line up across every branch column even when
 * a branch had no activity in a category (missing map key = 0). */
const SERVICE_CATEGORIES = [
  'Grooming',
  'Hotel',
  'Daycare',
  'Veterinary',
  'Assessment',
] as const;

export interface MetricOption {
  value: BranchComparisonMetric;
  label: string;
}

export const METRIC_OPTIONS: MetricOption[] = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'bookings', label: 'Bookings availed' },
  { value: 'avg_sale', label: 'Average sale value' },
  { value: 'new_customers', label: 'New customers' },
];

export interface MetricBreakdownRow {
  label: string;
  /** One value per branch, same order as the branches passed in. */
  values: number[];
  /** Overrides the view's format - e.g. a count row inside a peso view. */
  format?: (value: number) => string;
}

export interface MetricView {
  /** One headline value per branch, same order as the branches passed in. */
  headlines: number[];
  /** Short caption under each headline, e.g. "of total revenue". */
  caption: string;
  format: (value: number) => string;
  /** Whether a share-of-total bar means anything - not for an average. */
  showShare: boolean;
  /** Per-category rows; empty when the metric has no category split. */
  breakdown: MetricBreakdownRow[];
  /** Whether the breakdown is per service category (drives the chart). */
  isCategorySplit: boolean;
}

export function formatPeso(value: number) {
  return PESO_FORMATTER.format(value);
}

export function formatCount(value: number) {
  return COUNT_FORMATTER.format(value);
}

function averageSale(branch: BranchComparisonRow) {
  return branch.paid_transaction_count > 0
    ? branch.revenue_total / branch.paid_transaction_count
    : 0;
}

export function buildMetricView(
  metric: BranchComparisonMetric,
  branches: BranchComparisonRow[]
): MetricView {
  switch (metric) {
    case 'revenue':
      return {
        headlines: branches.map((branch) => Number(branch.revenue_total)),
        caption: 'settled revenue',
        format: formatPeso,
        showShare: true,
        isCategorySplit: true,
        breakdown: [
          ...SERVICE_CATEGORIES.map((category) => ({
            label: category,
            values: branches.map((branch) =>
              Number(branch.revenue_by_category[category] ?? 0)
            ),
          })),
          {
            label: 'Counter sales',
            values: branches.map((branch) => Number(branch.counter_sales)),
          },
        ],
      };
    case 'bookings':
      return {
        headlines: branches.map((branch) => branch.bookings_availed_total),
        caption: 'completed bookings',
        format: formatCount,
        showShare: true,
        isCategorySplit: true,
        breakdown: SERVICE_CATEGORIES.map((category) => ({
          label: category,
          values: branches.map(
            (branch) => branch.bookings_availed_by_category[category] ?? 0
          ),
        })),
      };
    case 'avg_sale':
      return {
        headlines: branches.map(averageSale),
        caption: 'per paid transaction',
        format: formatPeso,
        showShare: false,
        isCategorySplit: false,
        breakdown: [
          {
            label: 'Paid transactions',
            values: branches.map((branch) => branch.paid_transaction_count),
            format: formatCount,
          },
        ],
      };
    case 'new_customers':
      return {
        headlines: branches.map((branch) => branch.new_customers),
        caption: 'first booking at this branch',
        format: formatCount,
        showShare: true,
        isCategorySplit: false,
        breakdown: [],
      };
  }
}

/** Index of the single highest value, or null when there's no clear leader
 * (fewer than two branches, everything zero, or a tie at the top). */
export function leaderIndex(values: number[]): number | null {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  if (max <= 0) return null;

  const leaders = values.filter((value) => value === max);
  return leaders.length === 1 ? values.indexOf(max) : null;
}
