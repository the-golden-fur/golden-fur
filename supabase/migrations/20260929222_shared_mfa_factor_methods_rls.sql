alter table public.mfa_factor_methods enable row level security;

create policy "Users can read their own MFA factor method rows"
  on public.mfa_factor_methods
  for select
  to authenticated
  using (auth.uid() = user_id);
