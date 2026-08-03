-- Booking flow & pricing revamp (#22): adds "playtime" as a first-class care
-- instruction alongside feeding/walking/medication - same shape as walking
-- (a time-of-day block + a duration), tracked in its own table rather than
-- folded into care_walking_instructions so the Care Log / check-in flows can
-- keep treating each care type as its own fixed-shape structured form (the
-- same reasoning the original three tables were split out, see
-- 20260727052).
--
-- Also repurposes care_walking_instructions.time_block from a free HH:MM
-- clock-time string to the same Morning/Afternoon/Evening block
-- care_feeding_instructions.meal_time already uses: walk/play scheduling is
-- meant to be minutes-based ("15 min", "10 min"), not literal clock-time
-- ("7:00 AM"), so the new care_playing_instructions table is created with
-- that constraint from the start and the existing walking table is altered
-- to match. Any existing time_block value outside the three labels is
-- coerced to 'Morning' rather than left to violate the new constraint - it
-- was free text before, so there is no reliable way to recover which block
-- was originally meant.

update public.care_walking_instructions
set time_block = 'Morning'
where time_block not in ('Morning', 'Afternoon', 'Evening');

alter table public.care_walking_instructions
  add constraint care_walking_instructions_time_block_check
  check (time_block in ('Morning', 'Afternoon', 'Evening'));

create table public.care_playing_instructions (
  id uuid primary key default gen_random_uuid(),
  hotel_stay_id uuid not null references public.hotel_stays(id) on delete cascade,
  time_block text not null check (time_block in ('Morning', 'Afternoon', 'Evening')),
  duration_minutes integer not null check (duration_minutes > 0),
  notes text
);

create index care_playing_instructions_hotel_stay_id_idx
  on public.care_playing_instructions(hotel_stay_id);

alter table public.care_log_entries
  drop constraint care_log_entries_care_type_check,
  add constraint care_log_entries_care_type_check
  check (care_type in ('Feeding', 'Walking', 'Medication', 'Playing'));

-- RLS: identical shape to care_walking_instructions (20260727052).
alter table public.care_playing_instructions enable row level security;

create policy "Staff can read playing instructions at their branch"
  on public.care_playing_instructions
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

create policy "Front-desk staff can write playing instructions at their branch"
  on public.care_playing_instructions
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

create policy "Superadmins can manage all playing instructions"
  on public.care_playing_instructions
  for all
  to authenticated
  using (public.current_staff_role() = 'Superadmin')
  with check (public.current_staff_role() = 'Superadmin');
