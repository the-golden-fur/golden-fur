CREATE TABLE public.customer_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  contact_number text,
  emergency_contact_name text,
  emergency_contact_number text,
  preferred_communication_channel public.communication_channel,
  account_email text NOT NULL UNIQUE,
  primary_auth_provider public.auth_provider NOT NULL DEFAULT 'email'::public.auth_provider,
  facebook_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
