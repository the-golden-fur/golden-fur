alter table public.mfa_lockouts enable row level security;

create policy "Users can read their own MFA lockout row"
  on public.mfa_lockouts
  for select
  to authenticated
  using (auth.uid() = user_id);
