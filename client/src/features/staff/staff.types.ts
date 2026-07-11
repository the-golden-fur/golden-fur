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

export interface UnavailabilityBlock {
  id: string;
  staff_id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  created_by: string;
  created_at: string;
}

export interface UnavailabilityBlockPayload {
  quick_action?: boolean;
  start_time?: string;
  end_time?: string;
  reason?: string;
}
