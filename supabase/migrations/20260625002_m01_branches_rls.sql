alter table public.branches enable row level security;

do $$
begin
  create policy "Authenticated users can view branches"
    on public.branches
    for select
    to authenticated
    using (true);
exception when duplicate_object then
  null;
end $$;
