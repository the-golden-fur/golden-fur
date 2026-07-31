export const CUSTOMER_MANAGER_ROLES: readonly string[] = [
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
];

export type CommunicationChannel = 'Call' | 'Text' | 'Viber' | 'Messenger';

export type AuthProvider = 'email' | 'google' | 'facebook';

export interface CustomerProfile {
  id: string;
  full_name: string;
  contact_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  preferred_communication_channel: CommunicationChannel | null;
  account_email: string;
  primary_auth_provider: AuthProvider;
  facebook_id: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Narrower than CUSTOMER_MANAGER_ROLES - deactivate/archive/restore/
 * hard-delete of a customer or pet is Admin-tier, matching the gate used for
 * the same archive workflow on Products and Staff. */
export const CUSTOMER_ARCHIVE_ROLES: readonly string[] = [
  'Admin',
  'Superadmin',
];
