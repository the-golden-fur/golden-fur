-- Archived cages (20260928218) must not appear in the cage occupancy report.
-- Redefines get_cage_occupancy_report() from 20260805101, verbatim except for
-- the added `c.archived_at is null` filter.

create or replace function public.get_cage_occupancy_report(
  p_branch_id uuid
)
returns table (
  size public.cage_size,
  status public.cage_status,
  cage_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select c.size, c.status, count(*) as cage_count
  from public.cages c
  where c.archived_at is null
    and (p_branch_id is null or c.branch_id = p_branch_id)
  group by c.size, c.status
  order by c.size, c.status;
$$;
