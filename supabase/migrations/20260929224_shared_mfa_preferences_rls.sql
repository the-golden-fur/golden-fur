alter table public.mfa_preferences enable row level security;

create policy "Users can read their own MFA preference row"
  on public.mfa_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);
