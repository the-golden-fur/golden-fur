-- Bug fix for ...073_m02_pets_assessment_lock.sql's
-- enforce_pet_assessment_writes() trigger: as written, it could never
-- recognize a legitimate staff write from the running app.
--
-- pet.controller.ts (like every other write in this codebase) goes through
-- the single shared SERVICE-ROLE Supabase client
-- (server/src/config/supabase/supabase.config.ts), with no per-request JWT
-- propagated into the Postgres session. current_staff_role() reads
-- auth.uid(), which resolves from request.jwt.claims - for a service-role
-- connection with no claims set, auth.uid() is NULL, so
-- current_staff_role() is NULL, so the old trigger's is_assessor check was
-- ALWAYS false. That meant the trigger rejected every staff write that set
-- weight_class/coat_type, not just customer ones - it just hadn't been
-- exercised yet against a fresh database (existing pet rows predated the
-- trigger, and the automated test suite mocks the Supabase client, so
-- neither caught it).
--
-- The trigger still has a real job: pets' "Customers can update their own
-- pets" RLS policy (...025_m02_pets_rls.sql) was never narrowed to exclude
-- these two columns - RLS can't do column-level checks without a trigger -
-- so if a customer's own authenticated session ever wrote to Postgres
-- directly (bypassing the Express API), auth.uid() WOULD correctly resolve
-- to their own id, and they could still set weight_class/coat_type
-- themselves without this trigger.
--
-- Fix: only reject when the trigger can positively identify a real
-- authenticated non-staff caller (auth.uid() is not null). When auth.uid()
-- is null (the service-role path every real write in this app actually
-- takes), pass the row through untouched and trust whatever
-- assessed_by/assessed_at the caller supplied - consistent with this
-- codebase's existing service-role-plus-app-layer-authorization model
-- (RLS itself is already bypassed for every service-role write; this makes
-- the trigger stop fighting that instead of accidentally blocking it).
-- assessed_by/assessed_at stamping for that path now happens in
-- pet.controller.ts itself (see that file) - the trigger can no longer
-- infer identity for it.

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
    if is_untrusted_direct_write and (new.weight_class is not null or new.coat_type is not null) then
      raise exception 'weight_class and coat_type may only be set by staff (Receptionist/Admin/Supervisor/Superadmin) - the pet must be assessed onsite first';
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
  ) then
    raise exception 'weight_class and coat_type may only be changed by staff (Receptionist/Admin/Supervisor/Superadmin)';
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
