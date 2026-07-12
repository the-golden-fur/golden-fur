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
  created_at: string;
  updated_at: string;
}
