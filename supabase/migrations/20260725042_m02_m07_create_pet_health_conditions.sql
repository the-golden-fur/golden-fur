-- Revision Batch 1 - Epic A (#72): moves known-health-condition recording out
-- of the general-purpose pet profile (M02) and into the Veterinary console
-- (M07), where a Veterinarian records/maintains it during a consultation.
-- One row per pet (current-state record, not a history log - consultations
-- already provide per-visit history via #63/#66).
--
-- Deliberately additive/non-breaking: pets.health_conditions is copied into
-- the new table but NOT dropped here, so nothing still reading that column
-- breaks the moment this ships. It's dropped later, on purpose, by
-- migration 20260725046_m02_drop_deprecated_pet_columns.sql.

create table public.pet_health_conditions (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null unique references public.pets(id) on delete cascade,
  conditions_text text,
  updated_by_staff_id uuid not null references public.staff_profiles(id),
  updated_at timestamptz not null default now()
);

create index pet_health_conditions_pet_id_idx on public.pet_health_conditions(pet_id);

-- ---------------------------------------------------------------------------
-- RLS: INSERT/UPDATE restricted to the Veterinarian role (any Veterinarian,
-- no per-pet assigned-vet restriction - matches the existing M07
-- consultations.veterinarian_id pattern from #63). SELECT open to any
-- authenticated staff role, plus the owning customer (read-only, own pet
-- only) via the customer portal pet profile.
-- ---------------------------------------------------------------------------
alter table public.pet_health_conditions enable row level security;

create policy "Veterinarians can insert health conditions"
  on public.pet_health_conditions
  for insert
  to authenticated
  with check (public.current_staff_role() = 'Veterinarian');

create policy "Veterinarians can update health conditions"
  on public.pet_health_conditions
  for update
  to authenticated
  using (public.current_staff_role() = 'Veterinarian')
  with check (public.current_staff_role() = 'Veterinarian');

create policy "Any staff can read health conditions"
  on public.pet_health_conditions
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Customers can read their own pet's health conditions"
  on public.pet_health_conditions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.pets p
      where p.id = pet_health_conditions.pet_id
        and p.customer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Backfill: existing pets.health_conditions free-text values are copied into
-- pet_health_conditions.conditions_text. pets.health_conditions itself is
-- left in place (see header) - not dropped here. updated_by_staff_id has no
-- historical author to attribute to, so a placeholder Veterinarian is
-- required by the NOT NULL constraint - the earliest-created Veterinarian on
-- file (any Veterinarian may already view/edit any Makati pet's record, so
-- this is not a meaningful ownership claim, just a valid FK to satisfy the
-- schema). If no Veterinarian exists yet in a given environment, the
-- backfill is skipped for that environment (nothing to attribute to) - the
-- pet profile's read-only badge (#78) will simply show "none recorded".
-- ---------------------------------------------------------------------------
do $$
declare
  v_placeholder_vet_id uuid;
begin
  select id into v_placeholder_vet_id
  from public.staff_profiles
  where role = 'Veterinarian'
  order by created_at
  limit 1;

  if v_placeholder_vet_id is not null then
    insert into public.pet_health_conditions (pet_id, conditions_text, updated_by_staff_id)
    select id, health_conditions, v_placeholder_vet_id
    from public.pets
    where health_conditions is not null and btrim(health_conditions) <> ''
    on conflict (pet_id) do nothing;
  else
    raise notice 'pet_health_conditions backfill: no Veterinarian staff_profiles row exists - skipped (no attributable author)';
  end if;
end $$;

-- pets.health_conditions is intentionally NOT dropped here - see this
-- file's header and migration 20260725046_m02_drop_deprecated_pet_columns.sql.
