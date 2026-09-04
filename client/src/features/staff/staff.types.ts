export type StaffRole =
  | 'Superadmin'
  | 'Admin'
  | 'Supervisor'
  | 'Receptionist'
  | 'Groomer'
  | 'Veterinarian'
  | 'Cashier'
  | 'Pet Assistant';

/** Kept in sync with server ALL_STAFF_ROLES (staff.types.ts) and the
 * staff_role Postgres enum (supabase/migrations/20260625004_m01_create_
 * staff_role_enum.sql) - update all three together if roles ever change. */
export const ALL_STAFF_ROLES: readonly StaffRole[] = [
  'Superadmin',
  'Admin',
  'Supervisor',
  'Receptionist',
  'Groomer',
  'Veterinarian',
  'Cashier',
  'Pet Assistant',
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

export interface StaffProfileUpdatePayload {
  display_name?: string;
  phone_number?: string;
  emergency_contact_name?: string;
  emergency_contact_number?: string;
  preferred_communication_channel?: CommunicationChannel;
}

export type UnavailabilityBlockStatus = 'pending' | 'approved' | 'denied';

/** 'Rest Day' is fixed/manager-set only - never self-service (server-
 * enforced). The rest are self-requestable or manager-added. */
export const UNAVAILABILITY_LEAVE_TYPES = [
  'Rest Day',
  'Vacation Leave',
  'Sick Leave',
  'Other',
] as const;

export type UnavailabilityLeaveType =
  (typeof UNAVAILABILITY_LEAVE_TYPES)[number];

/** Self-service-eligible subset - excludes 'Rest Day'. */
export const SELF_SERVICE_LEAVE_TYPES: UnavailabilityLeaveType[] = [
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
   * any manager at the branch still can. */
  requested_reviewer_id: string | null;
  leave_type: UnavailabilityLeaveType;
}

export interface UnavailabilityBlockPayload {
  quick_action?: boolean;
  is_full_day?: boolean;
  /** YYYY-MM-DD - required when is_full_day is set. */
  date?: string;
  start_time?: string;
  end_time?: string;
  reason?: string;
  requested_reviewer_id?: string;
  leave_type?: UnavailabilityLeaveType;
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
  /** False when this row belongs to the viewer themselves (#29 AC-8). */
  reviewable: boolean;
  staff: PendingUnavailabilityBlockStaffSummary | null;
  requested_reviewer: RequestedReviewerSummary | null;
}

/** Monthly Schedule calendar row - branch-shared, equal CRUD for
 * Admin/Supervisor/Superadmin. `created_by_name` + `created_at` together are
 * the "who added this and when" log. */
export interface BranchScheduleEntry extends UnavailabilityBlock {
  staff: PendingUnavailabilityBlockStaffSummary | null;
  created_by_name: string | null;
}

export interface ReviewUnavailabilityBlockPayload {
  decision: 'approved' | 'denied';
  denial_reason?: string;
}

/** M01 Process 5: promote/demote, deactivate, transfer branch. */
export interface ManageStaffAccountPayload {
  role?: StaffRole;
  branch_id?: string;
  is_active?: boolean;
}

/** M01 Process 1: admin creates a staff account. */
export interface CreateStaffAccountPayload {
  username: string;
  registered_email: string;
  display_name: string;
  role: StaffRole;
  branch_id: string;
}

export interface CreateStaffAccountResult {
  staff: StaffProfile;
  temporary_password: string;
}
