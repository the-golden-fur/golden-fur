create table public.mfa_lockouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mfa_lockouts_user_id_key unique (user_id),
  constraint mfa_lockouts_failed_attempts_nonnegative check (failed_attempts >= 0)
);

create index mfa_lockouts_user_id_idx
  on public.mfa_lockouts (user_id);
