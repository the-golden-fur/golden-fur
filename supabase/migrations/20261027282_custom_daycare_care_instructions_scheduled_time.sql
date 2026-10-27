-- Custom change (Daycare-only clock-time scheduling): Daycare doesn't fit
-- the Morning/Noon/Afternoon/Evening day-period vocabulary Hotel's feeding/
-- walking/playing instructions use - a Daycare visit is a few hours long,
-- so staff/customers need to pick an actual drop-off/pick-up clock time, not
-- a vague part of the day. Hotel keeps its existing meal_time/time_block
-- enums unchanged; Daycare rows instead populate a new scheduled_time
-- column. Medication is untouched - it already stores literal clock times
-- (scheduled_times jsonb) for both categories.
--
-- These three tables have no stay_type column of their own (only reachable
-- via a join through stays.stay_type), so rather than a constraint that
-- needs that join, each row just states its own shape: exactly one of
-- {meal_time/time_block, scheduled_time} is set, enforced per-row by a
-- plain XOR check. The application layer (not this constraint) is what
-- guarantees a Hotel row always uses the enum column and a Daycare row
-- always uses scheduled_time.
--
-- meal_time/time_block's existing enum CHECK constraints are left as-is:
-- `NULL in (...)` evaluates to NULL in Postgres, which a CHECK treats as
-- satisfied, so making the column nullable needs no change to that
-- constraint.

alter table public.care_feeding_instructions
  alter column meal_time drop not null,
  add column scheduled_time time,
  add constraint care_feeding_instructions_time_xor_check
  check ((meal_time is not null) <> (scheduled_time is not null));

alter table public.care_walking_instructions
  alter column time_block drop not null,
  add column scheduled_time time,
  add constraint care_walking_instructions_time_xor_check
  check ((time_block is not null) <> (scheduled_time is not null));

alter table public.care_playing_instructions
  alter column time_block drop not null,
  add column scheduled_time time,
  add constraint care_playing_instructions_time_xor_check
  check ((time_block is not null) <> (scheduled_time is not null));
