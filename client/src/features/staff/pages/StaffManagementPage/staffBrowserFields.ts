import type {
  FilterField,
  FilterTile,
  SortFieldDescriptor,
  SortTile,
} from '../../../../shared/components/FilterSortBar/filterField.types';
import type { GroupByAxis } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import type { BranchSummary } from '../../../maintenance/maintenance.types';
import type { StaffProfile, StaffRole } from '../../staff.types';

const ALL_ROLES: StaffRole[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
];

/** Branch is only offered as a filter for a Superadmin viewer, who's the
 * only role that ever sees more than one branch's roster at once - same
 * gating the page's old plain `<select>` used. */
export function buildStaffFilterFields(
  branches: BranchSummary[],
  isSuperadminViewer: boolean
): FilterField[] {
  const roleField: FilterField = {
    id: 'role',
    label: 'Role',
    type: 'select',
    defaultValue: ALL_ROLES[0],
    options: ALL_ROLES.map((role) => ({ value: role, label: role })),
    formatValue: (value) => (typeof value === 'string' ? value : 'Any'),
  };

  if (!isSuperadminViewer) {
    return [roleField];
  }

  const branchField: FilterField = {
    id: 'branch',
    label: 'Branch',
    type: 'select',
    defaultValue: branches[0]?.id ?? '',
    options: branches.map((branch) => ({
      value: branch.id,
      label: branch.name,
    })),
    formatValue: (value) =>
      branches.find((branch) => branch.id === value)?.name ?? 'Any',
  };

  return [roleField, branchField];
}

/** Branch is only offered as a group-by axis for a Superadmin viewer, same
 * gating as the Branch filter - an Admin's roster is already all one
 * branch, so grouping by it would just produce a single column. */
export function buildStaffGroupByAxes(
  branches: BranchSummary[],
  isSuperadminViewer: boolean
): GroupByAxis<StaffProfile>[] {
  const roleAxis: GroupByAxis<StaffProfile> = {
    id: 'role',
    label: 'Role',
    columns: ALL_ROLES,
    columnFor: (staff) => staff.role,
  };

  if (!isSuperadminViewer) {
    return [roleAxis];
  }

  const branchAxis: GroupByAxis<StaffProfile> = {
    id: 'branch',
    label: 'Branch',
    columns: branches.map((branch) => branch.name),
    columnFor: (staff) =>
      branches.find((branch) => branch.id === staff.branch_id)?.name ??
      'Unknown branch',
  };

  return [roleAxis, branchAxis];
}

export type StaffSortKey = 'name-asc' | 'name-desc';

export const STAFF_SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'name',
    label: 'Name',
    directions: [
      { value: 'asc', label: 'A to Z' },
      { value: 'desc', label: 'Z to A' },
    ],
  },
];

export const STAFF_COMPARATORS: Record<
  StaffSortKey,
  (a: StaffProfile, b: StaffProfile) => number
> = {
  'name-asc': (a, b) => a.display_name.localeCompare(b.display_name),
  'name-desc': (a, b) => b.display_name.localeCompare(a.display_name),
};

export function deriveStaffSortKey(sortTile: SortTile | null): StaffSortKey {
  if (!sortTile) return 'name-asc';
  return sortTile.direction === 'desc' ? 'name-desc' : 'name-asc';
}

export function matchesStaffQuery(staff: StaffProfile, query: string): boolean {
  return (
    staff.display_name.toLowerCase().includes(query) ||
    staff.username.toLowerCase().includes(query) ||
    staff.registered_email.toLowerCase().includes(query)
  );
}

/** Every filter tile here is client-side only, reproducing the page's old
 * `filteredStaff` useMemo as a pure, independently-testable function. */
export function applyStaffFilters(
  staffList: StaffProfile[],
  tiles: FilterTile[]
): StaffProfile[] {
  let result = staffList;

  for (const tile of tiles) {
    if (tile.fieldId === 'role' && typeof tile.value === 'string') {
      result = result.filter((staff) => staff.role === tile.value);
    }

    if (tile.fieldId === 'branch' && typeof tile.value === 'string') {
      result = result.filter((staff) => staff.branch_id === tile.value);
    }
  }

  return result;
}
