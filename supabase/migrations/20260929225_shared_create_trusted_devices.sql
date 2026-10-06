-- "Remember this device" (30 days) - opt-in at MFA verify time, for accounts
-- where MFA is voluntary only. A trusted-device login never reaches Supabase
-- Auth's aal2 (that requires a real auth.mfa.verify() call, which this
-- deliberately skips) - it only lets the client skip re-showing the challenge
-- screen. Staff roles where MFA is mandatory (requireMfa.middleware.ts's
-- MANDATORY_MFA_ROLES) never get a trusted-device row written for them in the
-- first place, since their protected routes require a real aal2 session that
-- this can't provide - see mfaVerifyController's remember_device handling.
create table public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint trusted_devices_token_hash_key unique (token_hash)
);

create index trusted_devices_user_id_idx
  on public.trusted_devices (user_id);

-- Universal deleted-records archive (20260913202 convention).
create trigger trg_archive_deleted_row
  after delete on public.trusted_devices
  for each row execute function public.archive_deleted_row();
