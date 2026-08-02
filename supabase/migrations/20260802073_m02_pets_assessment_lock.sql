-- Client interview finding: customers could freely set/edit their own pet's
-- weight_class and coat_type, which directly drive Grooming pricing
-- (service_pricing_tiers lookup in booking.service.ts's resolveServicePrice)
-- and Hotel cage-size assignment (cageAssignment.service.ts) - a customer
-- could under-report either field to get a cheaper price / smaller cage. The
-- real process: pet comes onsite, staff physically weighs it and inspects
-- its coat, only then should it price/cage correctly. There was previously
-- no "assessed vs not" concept anywhere in this schema.
--
-- Fix: weight_class/coat_type become staff-only-writable, enforced here at
-- the DB layer as defense-in-depth (the app layer - pet.validator.ts/
-- pet.controller.ts - is the primary, UX-facing enforcement, giving a clean
-- 400 rather than a raw trigger exception for the normal customer flow).
-- NULL now means "not yet assessed" - chosen over adding a new enum value
-- (ALTER TYPE ... ADD VALUE has its own transaction/usage-ordering quirks)
-- so this is a one-line drop-not-null per column.
--
-- assessed_by/assessed_at mirror the reviewed_by/reviewed_at shape already
-- used on staff_unavailability_blocks (...019) - who/when last confirmed
-- these two fields, for a future "last assessed X ago" front-desk nudge
-- (deliberately NOT a blocking reassessment gate - staff can just re-edit
-- the pet on any visit).
--
-- This is the first trigger in this codebase that rejects a write based on
-- caller role - every other role gate so far is RLS-only (the "Staff can
-- manage all pets" / "Customers can update their own pets" policies on this
-- same table, from ...025, are unaffected and still govern every other pet
-- column normally). is_assessor uses the exact same role list as that
-- existing "Staff can manage all pets" policy, not a new one.
--
-- assessed_by/assessed_at are never taken from client input, in any branch -
-- the trigger always either stamps them fresh (auth.uid()/now(), only when
-- an assessor is actually setting both fields to non-null) or carries the
-- previous stored value forward untouched. This closes the spoofing path
-- where a caller could otherwise set assessed_by to an arbitrary staff id
-- without ever touching weight_class/coat_type.

alter table public.pets
  alter column weight_class drop not null,
  alter column coat_type drop not null;

alter table public.pets
  add column assessed_by uuid references public.staff_profiles(id),
  add column assessed_at timestamptz;

create or replace function public.enforce_pet_assessment_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_assessor boolean := public.current_staff_role() in
    ('Receptionist', 'Admin', 'Supervisor', 'Superadmin');
  is_new_assessment boolean;
begin
  if tg_op = 'INSERT' then
    if not is_assessor and (new.weight_class is not null or new.coat_type is not null) then
      raise exception 'weight_class and coat_type may only be set by staff (Receptionist/Admin/Supervisor/Superadmin) - the pet must be assessed onsite first';
    end if;

    if new.weight_class is not null and new.coat_type is not null then
      new.assessed_by := auth.uid();
      new.assessed_at := now();
    else
      new.assessed_by := null;
      new.assessed_at := null;
    end if;

    return new;
  end if;

  -- UPDATE
  if not is_assessor and (
    new.weight_class is distinct from old.weight_class
    or new.coat_type is distinct from old.coat_type
  ) then
    raise exception 'weight_class and coat_type may only be changed by staff (Receptionist/Admin/Supervisor/Superadmin)';
  end if;

  is_new_assessment := is_assessor
    and new.weight_class is not null
    and new.coat_type is not null
    and (
      new.weight_class is distinct from old.weight_class
      or new.coat_type is distinct from old.coat_type
    );

  if is_new_assessment then
    new.assessed_by := auth.uid();
    new.assessed_at := now();
  else
    new.assessed_by := old.assessed_by;
    new.assessed_at := old.assessed_at;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_pet_assessment_writes() from public;

create trigger trg_enforce_pet_assessment_writes
  before insert or update on public.pets
  for each row
  execute function public.enforce_pet_assessment_writes();
