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
  created_at: string;
  updated_at: string;
}

export type UnavailabilityBlockStatus = 'pending' | 'approved' | 'denied';

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
}

export interface PendingUnavailabilityBlockStaffSummary {
  id: string;
  display_name: string;
  profile_photo_url: string | null;
  role: StaffRole;
  branch_id: string;
}

export interface PendingUnavailabilityBlock extends UnavailabilityBlock {
  /** False when this row belongs to the caller themselves (#29 AC-8). */
  reviewable: boolean;
  staff: PendingUnavailabilityBlockStaffSummary | null;
}
