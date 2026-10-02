-- Proof that an Admin-tier staff member (see mandatoryMfaRoles.ts) actually
-- controls the email their "email" MFA method would send codes to. This is
-- deliberately separate from mfa_factor_methods: it tracks ownership of a
-- verified email address, which can exist (and be re-verified after a
-- change) before the user ever turns 'email' on as an active MFA method -
-- enrollMfaMethod checks verified_at is set before allowing that.
--
-- code_hash/code_expires_at/code_sent_at mirror trusted_devices' "never
-- store the verifiable secret itself" shape and mfa_factor_methods'
-- last_code_sent_at throttle pattern; cleared once verified_at is set.
create table public.mfa_email_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  verified_at timestamptz,
  code_hash text,
  code_expires_at timestamptz,
  code_sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Universal deleted-records archive (20260913202 convention).
create trigger trg_archive_deleted_row
  after delete on public.mfa_email_verifications
  for each row execute function public.archive_deleted_row();
