-- Custom change (Daycare/Hotel parity): Daycare gains cage assignment and
-- the same structured feeding/walking/playing/medication care instructions
-- + Care Log that Hotel already has - "make daycare the same as hotel...
-- the only difference will be their services". Rather than duplicating
-- hotel_stays and its four care_* child tables for Daycare, this migration
-- generalizes hotel_stays into a shared `stays` table (stay_type
-- discriminator) and repoints every care_* table's hotel_stay_id FK at it
-- as stay_id, so check-in/checkout/care-log stays one codepath for both
-- categories. daycare_sessions is dropped outright - no production data to
-- preserve (same posture as 20260803077's booking_items pass and
-- 20260728058's status unification): a fresh `supabase db reset` is the
-- expected path, not an in-place data carry-forward.
--
-- ---------------------------------------------------------------------------
-- stays (renamed from hotel_stays)
-- ---------------------------------------------------------------------------

alter table public.hotel_stays rename to stays;

alter table public.stays
  add column stay_type text not null default 'Hotel'
    check (stay_type in ('Hotel', 'Daycare')),
  -- Direct branch_id (not just derivable via cage_id -> cages.branch_id):
  -- Daycare's checkin-cutoff check was already a hot single-table read on
  -- daycare_sessions.branch_id before this merge (20260719039 dev notes) -
  -- kept here rather than lost, and it also lets every RLS policy below
  -- drop the join-through-cages indirection Hotel used to need.
  add column branch_id uuid references public.branches(id),
  -- Reintroduced after 20260728061 dropped hotel_stays.status ("nothing is
  -- lost - hotel_stays.booking_id is NOT NULL, so bookings.status is always
  -- available instead"). That assumption no longer holds once Daycare walk-
  -- ins (booking_id IS NULL, daycare_sessions' pre-existing behavior) share
  -- this table - a walk-in has no booking row to derive status from, so it
  -- needs its own authoritative status again, matching daycare_sessions'
  -- original column exactly.
  add column status text not null default 'Active'
    check (status in ('Active', 'Completed')),
  -- From daycare_sessions - Daycare's own per-elapsed-hour/night charge,
  -- computed and stored at checkout (daycareBilling.service.ts). Unused for
  -- Hotel rows, which keep billing via downpayment_amount/extension_fee.
  add column computed_charge numeric(10, 2);

alter table public.stays alter column stay_type drop default;

update public.stays s
set branch_id = c.branch_id,
    status = case when s.actual_check_out_at is null then 'Active' else 'Completed' end
from public.cages c
where c.id = s.cage_id;

alter table public.stays
  alter column branch_id set not null,
  -- Daycare walk-ins have no booking (daycare_sessions' pre-existing
  -- convention); Hotel stays always do (unchanged) - enforced below by
  -- stays_hotel_requires_booking_fields instead of a blanket NOT NULL.
  alter column booking_id drop not null,
  alter column scheduled_check_out_date drop not null,
  alter column downpayment_amount drop not null;

alter table public.stays
  add constraint stays_hotel_requires_booking_fields
  check (
    stay_type = 'Daycare'
    or (
      booking_id is not null
      and scheduled_check_out_date is not null
      and downpayment_amount is not null
    )
  );

-- hotel_stays.booking_id was UNIQUE NOT NULL (one stay per Hotel booking);
-- replaced with a partial unique index so Daycare walk-ins (booking_id IS
-- NULL) are unrestricted, matching daycare_sessions_booking_id_key exactly.
alter table public.stays drop constraint hotel_stays_booking_id_key;
create unique index stays_booking_id_key
  on public.stays(booking_id)
  where booking_id is not null;

drop index if exists public.hotel_stays_pet_id_idx;
drop index if exists public.hotel_stays_status_idx;
create index stays_pet_id_idx on public.stays(pet_id);
create index stays_branch_status_idx on public.stays(branch_id, status);
create index stays_stay_type_idx on public.stays(stay_type);

-- ---------------------------------------------------------------------------
-- care_* child tables: hotel_stay_id -> stay_id (same FK target, now
-- `stays`; Postgres tracks foreign keys by OID so this rename alone already
-- carries them over - only the column name needs updating for clarity).
-- ---------------------------------------------------------------------------

alter table public.care_feeding_instructions rename column hotel_stay_id to stay_id;
alter table public.care_walking_instructions rename column hotel_stay_id to stay_id;
alter table public.care_playing_instructions rename column hotel_stay_id to stay_id;
alter table public.care_medication_instructions rename column hotel_stay_id to stay_id;
alter table public.care_log_entries rename column hotel_stay_id to stay_id;

alter index public.care_feeding_instructions_hotel_stay_id_idx rename to care_feeding_instructions_stay_id_idx;
alter index public.care_walking_instructions_hotel_stay_id_idx rename to care_walking_instructions_stay_id_idx;
alter index public.care_playing_instructions_hotel_stay_id_idx rename to care_playing_instructions_stay_id_idx;
alter index public.care_medication_instructions_hotel_stay_id_idx rename to care_medication_instructions_stay_id_idx;
alter index public.care_log_entries_hotel_stay_id_idx rename to care_log_entries_stay_id_idx;

-- stay_date partial indexes (20260803087) already carry over unchanged -
-- they're defined on (hotel_stay_id, stay_date) which is now (stay_id,
-- stay_date) automatically since the column itself was renamed in place.

-- ---------------------------------------------------------------------------
-- Drop daycare_sessions - fully superseded by `stays` (stay_type =
-- 'Daycare'). No data migration: dev/seed-only data, same posture as this
-- repo's other from-scratch schema passes.
-- ---------------------------------------------------------------------------

drop table public.daycare_sessions;

-- ---------------------------------------------------------------------------
-- RLS - `stays`. Same role shape hotel_stays already had post-#81
-- (Receptionist/Admin/Supervisor/Groomer/Pet Assistant at their own branch;
-- Superadmin unrestricted) - Daycare's own advance roles were already
-- identical (DAYCARE_ADVANCE_ROLES === HOTEL_ADVANCE_ROLES), so no
-- stay_type-based differentiation is needed here. Scoped directly by the
-- new stays.branch_id column instead of joining through cages.
-- ---------------------------------------------------------------------------

drop policy "Staff can read hotel stays at their branch" on public.stays;
drop policy "Staff can create hotel stays at their branch" on public.stays;
drop policy "Staff can update hotel stays at their branch" on public.stays;
drop policy "Superadmins can manage all hotel stays" on public.stays;

create policy "Staff can read stays at their branch"
  on public.stays
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );

create policy "Staff can create stays at their branch"
  on public.stays
  for insert
  to authenticated
  with check (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );

create policy "Staff can update stays at their branch"
  on public.stays
  for update
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  )
  with check (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Groomer', 'Pet Assistant'
    )
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );

create policy "Superadmins can manage all stays"
  on public.stays
  for all
  to authenticated
  using (public.current_staff_role() = 'Superadmin')
  with check (public.current_staff_role() = 'Superadmin');

-- ---------------------------------------------------------------------------
-- RLS - care_feeding/walking/playing/medication_instructions +
-- care_log_entries: identical shape to before, just retargeted at
-- stays/stay_id instead of hotel_stays/hotel_stay_id. Role lists are
-- unchanged (no Groomer here - matches the pre-existing asymmetry where
-- Groomer can check pets in/out at the stays level but never directly
-- writes structured care instructions).
-- ---------------------------------------------------------------------------

drop policy "Staff can read feeding instructions at their branch" on public.care_feeding_instructions;
drop policy "Front-desk staff can write feeding instructions at their branch" on public.care_feeding_instructions;
drop policy "Superadmins can manage all feeding instructions" on public.care_feeding_instructions;

create policy "Staff can read feeding instructions at their branch"
  on public.care_feeding_instructions
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Pet Assistant'
    )
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
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
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  )
  with check (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
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

drop policy "Staff can read walking instructions at their branch" on public.care_walking_instructions;
drop policy "Front-desk staff can write walking instructions at their branch" on public.care_walking_instructions;
drop policy "Superadmins can manage all walking instructions" on public.care_walking_instructions;

create policy "Staff can read walking instructions at their branch"
  on public.care_walking_instructions
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Pet Assistant'
    )
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
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
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  )
  with check (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
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

drop policy "Staff can read playing instructions at their branch" on public.care_playing_instructions;
drop policy "Front-desk staff can write playing instructions at their branch" on public.care_playing_instructions;
drop policy "Superadmins can manage all playing instructions" on public.care_playing_instructions;

create policy "Staff can read playing instructions at their branch"
  on public.care_playing_instructions
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Pet Assistant'
    )
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
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
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  )
  with check (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
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

drop policy "Staff can read medication instructions at their branch" on public.care_medication_instructions;
-- Matches whatever this policy's name actually resolves to in storage
-- (truncated to 63 bytes since 20260727052 first created it - see the
-- CREATE below for why the recreated version below uses a shorter name).
drop policy "Front-desk staff can write medication instructions at their branch" on public.care_medication_instructions;
drop policy "Superadmins can manage all medication instructions" on public.care_medication_instructions;

create policy "Staff can read medication instructions at their branch"
  on public.care_medication_instructions
  for select
  to authenticated
  using (
    public.current_staff_role() in (
      'Receptionist', 'Admin', 'Supervisor', 'Pet Assistant'
    )
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

-- Named "...at branch" (not "...at their branch" like every other policy
-- here) purely to fit Postgres's 63-byte identifier limit - with "their"
-- this name is 66 bytes and gets silently truncated to "Front-desk
-- staffcan write medication instructions at their bra" (NOTICE 42622 on
-- every `db reset`), which is what the original 20260727052 migration did
-- from day one. Shortened only for this one recreated policy; harmless
-- either way since nothing in application code references RLS policy
-- names, but avoids the confusing NOTICE spam.
create policy "Front-desk staff can write medication instructions at branch"
  on public.care_medication_instructions
  for all
  to authenticated
  using (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  )
  with check (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
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

drop policy "Pet assistants can read care log entries at their branch" on public.care_log_entries;
drop policy "Front-desk staff can read care log entries at their branch" on public.care_log_entries;
drop policy "Superadmins can read all care log entries" on public.care_log_entries;

create policy "Pet assistants can read care log entries at their branch"
  on public.care_log_entries
  for select
  to authenticated
  using (
    public.current_staff_role() = 'Pet Assistant'
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Front-desk staff can read care log entries at their branch"
  on public.care_log_entries
  for select
  to authenticated
  using (
    public.current_staff_role() in ('Receptionist', 'Admin', 'Supervisor')
    and stay_id in (
      select s.id from public.stays s
      where s.branch_id = (
        select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
      )
    )
  );

create policy "Superadmins can read all care log entries"
  on public.care_log_entries
  for select
  to authenticated
  using (public.current_staff_role() = 'Superadmin');
