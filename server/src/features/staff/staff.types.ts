export const ALL_STAFF_ROLES = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
] as const;

export type StaffRole = (typeof ALL_STAFF_ROLES)[number];

export const ADMIN_ROLES: readonly string[] = ['Admin', 'Superadmin'];

/**
 * Custom change (Gmail-style messaging redesign): who may send an
 * Announcement-type message - wider than ADMIN_ROLES (which also gates
 * unrelated staff-CRUD routes) on purpose, so widening this doesn't touch
 * staff account management.
 */
export const ANNOUNCEMENT_SENDER_ROLES: readonly string[] = [
  'Supervisor',
  'Admin',
  'Superadmin',
];

/**
 * Roles allowed to act on another staff member's unavailability block —
 * create/cancel/list on-behalf-of (#28) and review a pending request (#29).
 * Deliberately separate from ADMIN_ROLES: that constant also gates staff
 * profile CRUD/avatar upload, which Supervisor is not granted here.
 */
export const UNAVAILABILITY_MANAGER_ROLES: readonly string[] = [
  'Admin',
  'Supervisor',
  'Superadmin',
];

export type CommunicationChannel = 'Call' | 'Text' | 'Viber' | 'Messenger';

export interface StaffProfile {
  id: string;
  branch_id: string;
  role: StaffRole;
  username: string;
  registered_email: string;
  display_name: string;
  profile_photo_url: string | null;
  phone_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  preferred_communication_channel: CommunicationChannel | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type UnavailabilityBlockStatus = 'pending' | 'approved' | 'denied';

/** 'Rest Day' is fixed/manager-set only (never self-service, enforced in
 * unavailabilityBlock.service.ts); the rest can be self-requested or
 * manager-added. 'Other' is the default for pre-existing/ad-hoc entries. */
export const UNAVAILABILITY_LEAVE_TYPES = [
  'Rest Day',
  'Vacation Leave',
  'Sick Leave',
  'Other',
] as const;

export type UnavailabilityLeaveType =
  (typeof UNAVAILABILITY_LEAVE_TYPES)[number];

/** Self-service-eligible subset - excludes 'Rest Day'. */
export const SELF_SERVICE_LEAVE_TYPES: readonly UnavailabilityLeaveType[] = [
  'Vacation Leave',
  'Sick Leave',
  'Other',
];

export interface UnavailabilityBlock {
  id: string;
  staff_id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  created_by: string;
  created_at: string;
  status: UnavailabilityBlockStatus;
  is_quick_action: boolean;
  /** Entire Day option - the window spans that date's full branch
   * operating hours rather than a specific start_time/end_time range. */
  is_full_day: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  denial_reason: string | null;
  /** Optional, non-binding: which Supervisor/Admin/Superadmin the requester
   * addressed this to. Does not restrict who may actually approve/deny -
   * any UNAVAILABILITY_MANAGER_ROLES member at the branch still can. */
  requested_reviewer_id: string | null;
  leave_type: UnavailabilityLeaveType;
}

export interface PendingUnavailabilityBlockStaffSummary {
  id: string;
  display_name: string;
  profile_photo_url: string | null;
  role: StaffRole;
  branch_id: string;
}

export interface RequestedReviewerSummary {
  id: string;
  display_name: string;
}

export interface PendingUnavailabilityBlock extends UnavailabilityBlock {
  /** False when this row belongs to the caller themselves (#29 AC-8). */
  reviewable: boolean;
  staff: PendingUnavailabilityBlockStaffSummary | null;
  requested_reviewer: RequestedReviewerSummary | null;
}

/**
 * Monthly Schedule calendar row - the branch-shared view Supervisor/Admin/
 * Superadmin all read and write equally. `created_by_name` is the log this
 * feature asked for ("which user added this, and when") - `created_at` is
 * already on UnavailabilityBlock; this just resolves the display name for
 * `created_by`, which is an auth.users id, not directly embeddable via
 * staff_profiles FK.
 */
export interface BranchScheduleEntry extends UnavailabilityBlock {
  staff: PendingUnavailabilityBlockStaffSummary | null;
  created_by_name: string | null;
}
