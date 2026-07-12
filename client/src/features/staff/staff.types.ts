export type StaffRole =
  | 'Superadmin'
  | 'Admin'
  | 'Supervisor'
  | 'Receptionist'
  | 'Groomer'
  | 'Veterinarian'
  | 'Cashier'
  | 'Pet Assistant';

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

export interface StaffProfileUpdatePayload {
  display_name?: string;
  phone_number?: string;
  emergency_contact_name?: string;
  emergency_contact_number?: string;
  preferred_communication_channel?: CommunicationChannel;
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
  reviewed_by: string | null;
  reviewed_at: string | null;
  denial_reason: string | null;
}

export interface UnavailabilityBlockPayload {
  quick_action?: boolean;
  start_time?: string;
  end_time?: string;
  reason?: string;
}

export interface PendingUnavailabilityBlockStaffSummary {
  id: string;
  display_name: string;
  profile_photo_url: string | null;
  role: StaffRole;
  branch_id: string;
}

export interface PendingUnavailabilityBlock extends UnavailabilityBlock {
  /** False when this row belongs to the viewer themselves (#29 AC-8). */
  reviewable: boolean;
  staff: PendingUnavailabilityBlockStaffSummary | null;
}

export interface ReviewUnavailabilityBlockPayload {
  decision: 'approved' | 'denied';
  denial_reason?: string;
}
