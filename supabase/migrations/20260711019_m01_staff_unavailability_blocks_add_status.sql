-- Epic B (#27 prerequisite, schema portion of #29): staffAvailability.service.ts
-- (#27) must filter approved-only Unavailability Blocks, per its own dev notes
-- ("Build this issue against #29's schema from the start"). #29's full backend
-- (review endpoints, no-self-review RLS, PATCH .../review, GET .../pending) is
-- not part of this migration and remains separate, future work owned by #29 --
-- this migration lands only the schema piece #27 has a hard dependency on:
-- the status enum/columns and the BEFORE INSERT trigger that assigns status.
--
-- Trigger logic mirrors the Epic B Guide's #29 reference implementation:
--   - is_quick_action = true                -> status = 'approved'
--   - created_by <> staff_id (on-behalf-of) -> status = 'approved'
--   - otherwise (self, custom range)        -> status = 'pending'
--
-- Also drops the staff "own" UPDATE policy so a staff member can never flip
-- their own row's status via a direct table update once status exists -- the
-- only remaining UPDATE path is the Admin/Superadmin "manage all" policy from
-- migration ...015, which #29 proper will further restrict (no self-review)
-- once its review endpoint lands.

create type public.unavailability_block_status as enum ('pending', 'approved', 'denied');

alter table public.staff_unavailability_blocks
  add column status public.unavailability_block_status not null default 'pending',
  add column is_quick_action boolean not null default false,
  add column reviewed_by uuid references public.staff_profiles(id),
  add column reviewed_at timestamptz,
  add column denial_reason text;

create or replace function public.enforce_unavailability_block_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_quick_action then
    new.status := 'approved';
  elsif new.created_by <> new.staff_id then
    -- Admin/Supervisor/Superadmin acting on behalf of another staff member
    new.status := 'approved';
  else
    -- staff member requesting a custom range for themselves
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.denial_reason := null;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_unavailability_block_status
  before insert on public.staff_unavailability_blocks
  for each row
  execute function public.enforce_unavailability_block_status();

drop policy if exists "Staff can update their own unavailability blocks"
  on public.staff_unavailability_blocks;
