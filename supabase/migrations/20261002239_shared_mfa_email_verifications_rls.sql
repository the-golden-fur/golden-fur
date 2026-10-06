alter table public.mfa_email_verifications enable row level security;

create policy "Users can read their own MFA email verification row"
  on public.mfa_email_verifications
  for select
  to authenticated
  using (auth.uid() = user_id);
