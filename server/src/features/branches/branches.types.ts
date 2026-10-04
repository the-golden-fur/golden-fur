/**
 * Superadmin System Configuration - deliberately narrower than
 * staff.types.ts's ADMIN_ROLES (Admin + Superadmin): branch identity/hours
 * are system-level config, not day-to-day admin work, per this feature's
 * explicit scope.
 */
export const BRANCH_CONFIG_ROLES: readonly string[] = ['Superadmin'];

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export interface OperatingHoursEntry {
  /** "HH:MM", branch-local wall-clock time. */
  open: string;
  close: string;
}

/** A day absent from this map means the branch is closed that day - matches
 * availability.service.ts's getDaySlots "no window = closed" semantics. */
export type OperatingHours = Partial<Record<Weekday, OperatingHoursEntry>>;

export interface Branch {
  id: string;
  name: string;
  address: string;
  contact_number: string | null;
  is_vet_branch: boolean;
  operating_hours: OperatingHours;
  /** Custom change (per-branch Grooming hours, migration 20261004243): the
   * times Grooming is bookable each weekday, same shape as operating_hours.
   * A day absent from this map means Grooming follows that day's full
   * operating hours. */
  grooming_hours: OperatingHours;
  timezone: string;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
}
