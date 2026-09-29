-- Maps a Supabase Auth MFA factor id to which of our two user-facing
-- "methods" it represents (authenticator app vs. email). Supabase itself has
-- no concept of "method" beyond factor_type ('totp'/'phone'/'webauthn') and
-- an optional friendly_name string - this table is the authoritative source
-- of truth our own controllers use instead of string-matching friendly_name.
--
-- The 'email' method is still, under the hood, a real Supabase TOTP factor -
-- the server computes the current code from the stored secret and emails it,
-- rather than the user's own authenticator app computing it. This is what
-- lets an email-verified session reach aal2 exactly like an authenticator-
-- verified one, since it goes through the same real auth.mfa.verify() call.
-- secret_ciphertext/-_iv are therefore only ever set for the 'email' method -
-- an authenticator-app factor's secret is never known to the server at all,
-- by design.
create table public.mfa_factor_methods (
  factor_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('authenticator', 'email')),
  secret_ciphertext text,
  secret_iv text,
  -- 'email' method only - throttles /mfa/email/request-code (see
  -- mfaMethods.service.ts's sendMfaEmailMethodCode) so a valid but
  -- compromised password alone can't be used to mail-bomb the account's
  -- inbox or burn through the email provider's send quota; the existing
  -- MFA lockout only covers failed *verify* attempts, not code requests.
  last_code_sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mfa_factor_methods_user_id_method_key unique (user_id, method),
  constraint mfa_factor_methods_email_secret_present check (
    (method = 'email' and secret_ciphertext is not null and secret_iv is not null)
    or (method = 'authenticator' and secret_ciphertext is null and secret_iv is null)
  )
);

create index mfa_factor_methods_user_id_idx
  on public.mfa_factor_methods (user_id);

-- Universal deleted-records archive (20260913202 convention).
create trigger trg_archive_deleted_row
  after delete on public.mfa_factor_methods
  for each row execute function public.archive_deleted_row();
