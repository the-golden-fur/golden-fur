alter table public.trusted_devices enable row level security;

create policy "Users can read their own trusted device rows"
  on public.trusted_devices
  for select
  to authenticated
  using (auth.uid() = user_id);
