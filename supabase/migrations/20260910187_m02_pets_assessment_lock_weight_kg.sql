-- Extends enforce_pet_assessment_writes() (last defined in
-- ...20260802075_m02_pets_assessment_trigger_fix.sql) to cover the new
-- pets.weight_kg column.
--
-- weight_kg drives the derived weight_class, which drives Grooming price and
-- Hotel/Daycare cage size - the exact manipulation vector
-- ...073_m02_pets_assessment_lock.sql was written to close for
-- weight_class/coat_type. A customer authenticating straight to Postgres
-- (bypassing the Express API) could otherwise set a low weight_kg to land a
-- cheaper tier / smaller cage. So weight_kg gets the same defence-in-depth
-- treatment: rejected only when the trigger can positively identify a real
-- authenticated non-staff caller (auth.uid() is not null). The service-role
-- path every real app write takes (auth.uid() NULL) passes through untouched,
-- exactly as before - assessment stamping for that path stays in
-- pet.controller.ts.
--
-- Function body is otherwise a verbatim copy of ...075 - only the three
-- weight_kg clauses are new. The trigger itself (trg_enforce_pet_assessment_writes,
-- from ...073) is unchanged and not recreated.

create or replace function public.enforce_pet_assessment_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  is_assessor boolean := caller is not null and public.current_staff_role() in
    ('Receptionist', 'Admin', 'Supervisor', 'Superadmin');
  -- A real authenticated session (customer or otherwise) that isn't staff.
  -- NULL caller (service-role/seed context) is never "untrusted" here - see
  -- header.
  is_untrusted_direct_write boolean := caller is not null and not is_assessor;
begin
  if tg_op = 'INSERT' then
    if is_untrusted_direct_write and (
      new.weight_class is not null
      or new.coat_type is not null
      or new.weight_kg is not null
    ) then
      raise exception 'weight_class, coat_type and weight_kg may only be set by staff (Receptionist/Admin/Supervisor/Superadmin) - the pet must be assessed onsite first';
    end if;

    if is_assessor and new.weight_class is not null and new.coat_type is not null then
      new.assessed_by := coalesce(new.assessed_by, caller);
      new.assessed_at := coalesce(new.assessed_at, now());
    end if;

    return new;
  end if;

  -- UPDATE
  if is_untrusted_direct_write and (
    new.weight_class is distinct from old.weight_class
    or new.coat_type is distinct from old.coat_type
    or new.weight_kg is distinct from old.weight_kg
  ) then
    raise exception 'weight_class, coat_type and weight_kg may only be changed by staff (Receptionist/Admin/Supervisor/Superadmin)';
  end if;

  if is_assessor
    and new.weight_class is not null
    and new.coat_type is not null
    and (
      new.weight_class is distinct from old.weight_class
      or new.coat_type is distinct from old.coat_type
    )
  then
    new.assessed_by := caller;
    new.assessed_at := now();
  end if;

  return new;
end;
$$;
