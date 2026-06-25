alter table public.branches enable row level security;

create policy "Authenticated users can view branches"
  on public.branches
  for select
  to authenticated
  using (true);
