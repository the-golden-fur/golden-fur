export interface CustomerAuthInput {
  account_email: string;
  password?: string;
  full_name?: string;
}

export interface CustomerProfile {
  id: string; // auth.users.id
  account_email: string;
  full_name: string;
  primary_auth_provider: 'email' | 'google' | 'facebook';
  facebook_id?: string | null;
  created_at?: string;
  updated_at?: string;
}
