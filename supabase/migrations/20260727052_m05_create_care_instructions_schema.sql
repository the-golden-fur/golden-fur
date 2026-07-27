-- Sprint 4 Epic A (#73): M05 structured care-instruction tables - feeding /
-- walking / medication. Depends on #72 (hotel_stays).
--
-- Three tables, not one wide table: each is a fixed-shape structured form
-- (feeding is per-meal-time, walking is per-time-block, medication is
-- per-drug), per Modules-Features' structured-entry requirement.

create table public.care_feeding_instructions (
  id uuid primary key default gen_random_uuid(),
  hotel_stay_id uuid not null references public.hotel_stays(id) on delete cascade,
  meal_time text not null check (meal_time in ('Morning', 'Afternoon', 'Evening')),
  food_type text not null,
  quantity text not null,
  special_instructions text
);

create table public.care_walking_instructions (
  id uuid primary key default gen_random_uuid(),
  hotel_stay_id uuid not null references public.hotel_stays(id) on delete cascade,
  time_block text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  notes text
);

create table public.care_medication_instructions (
  id uuid primary key default gen_random_uuid(),
  hotel_stay_id uuid not null references public.hotel_stays(id) on delete cascade,
  medication_name text not null,
  dose text not null,
  -- Array of time values per day, e.g. ['8:00 AM','8:00 PM'].
  scheduled_times jsonb not null default '[]'::jsonb,
  administration_notes text,
  -- Reference note, not a live FK - a one-time copy from M07's current-
  -- prescription derivation when pre-filled, so the receptionist's free
  -- edits here never write back to the M07 clinical record (#73 dev notes).
  source_prescription_note text
);

create index care_feeding_instructions_hotel_stay_id_idx
  on public.care_feeding_instructions(hotel_stay_id);
create index care_walking_instructions_hotel_stay_id_idx
  on public.care_walking_instructions(hotel_stay_id);
create index care_medication_instructions_hotel_stay_id_idx
  on public.care_medication_instructions(hotel_stay_id);

-- ---------------------------------------------------------------------------
-- RLS - identical access pattern across all three tables: Receptionist/
-- Admin/Supervisor/Superadmin full read/write at their own branch (resolved
-- via hotel_stays -> cages.branch_id); Pet Assistant read-only (needed so
-- the Care Log checklist can display the underlying instruction detail) -
-- explicitly no INSERT/UPDATE/DELETE grant, enforcing "pet assistants may
-- only mark entries as completed" at the database layer (#73 dev notes).
-- ---------------------------------------------------------------------------

alter table public.care_feeding_instructions enable row level security;
alter table public.care_walking_instructions enable row level security;
alter table public.care_medication_instructions enable row level security;

create policy "Staff can read feeding instructions at their branch"
  on public.care_feeding_instructions
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Pet Assistant'
    )
    and hotel_stay_id in (
      select hs.id from public.hotel_stays hs
      join public.cages c on c.id = hs.cage_id
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Front-desk staff can write feeding instructions at their branch"
  on public.care_feeding_instructions
  for all
  to authenticated
  using (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and hotel_stay_id in (
      select hs.id from public.hotel_stays hs
      join public.cages c on c.id = hs.cage_id
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  )
  with check (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and hotel_stay_id in (
      select hs.id from public.hotel_stays hs
      join public.cages c on c.id = hs.cage_id
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Superadmins can manage all feeding instructions"
  on public.care_feeding_instructions
  for all
  to authenticated
  using (public.current_staff_role() = 'Superadmin')
  with check (public.current_staff_role() = 'Superadmin');

create policy "Staff can read walking instructions at their branch"
  on public.care_walking_instructions
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Pet Assistant'
    )
    and hotel_stay_id in (
      select hs.id from public.hotel_stays hs
      join public.cages c on c.id = hs.cage_id
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Front-desk staff can write walking instructions at their branch"
  on public.care_walking_instructions
  for all
  to authenticated
  using (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and hotel_stay_id in (
      select hs.id from public.hotel_stays hs
      join public.cages c on c.id = hs.cage_id
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  )
  with check (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and hotel_stay_id in (
      select hs.id from public.hotel_stays hs
      join public.cages c on c.id = hs.cage_id
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Superadmins can manage all walking instructions"
  on public.care_walking_instructions
  for all
  to authenticated
  using (public.current_staff_role() = 'Superadmin')
  with check (public.current_staff_role() = 'Superadmin');

create policy "Staff can read medication instructions at their branch"
  on public.care_medication_instructions
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Pet Assistant'
    )
    and hotel_stay_id in (
      select hs.id from public.hotel_stays hs
      join public.cages c on c.id = hs.cage_id
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Front-desk staff can write medication instructions at their branch"
  on public.care_medication_instructions
  for all
  to authenticated
  using (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and hotel_stay_id in (
      select hs.id from public.hotel_stays hs
      join public.cages c on c.id = hs.cage_id
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  )
  with check (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and hotel_stay_id in (
      select hs.id from public.hotel_stays hs
      join public.cages c on c.id = hs.cage_id
      where c.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Superadmins can manage all medication instructions"
  on public.care_medication_instructions
  for all
  to authenticated
  using (public.current_staff_role() = 'Superadmin')
  with check (public.current_staff_role() = 'Superadmin');
