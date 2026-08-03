-- Booking flow & pricing revamp (#22): lets a multi-night hotel stay carry
-- different feeding/walking/playing/medication instructions per calendar
-- night instead of one set applied uniformly to every day. stay_date is
-- nullable and additive, not a replacement: null keeps today's behavior
-- unchanged (the row applies to every day of the stay, per
-- careInstructions.service.ts's generateCareLogEntries), while a non-null
-- date scopes the row to that single night only - a customer/receptionist
-- who leaves "same instructions every night" on never produces stay_date
-- values at all, so existing check-in flows and existing rows need no
-- backfill.

alter table public.care_feeding_instructions add column stay_date date;
alter table public.care_walking_instructions add column stay_date date;
alter table public.care_playing_instructions add column stay_date date;
alter table public.care_medication_instructions add column stay_date date;

create index care_feeding_instructions_stay_date_idx
  on public.care_feeding_instructions(hotel_stay_id, stay_date);
create index care_walking_instructions_stay_date_idx
  on public.care_walking_instructions(hotel_stay_id, stay_date);
create index care_playing_instructions_stay_date_idx
  on public.care_playing_instructions(hotel_stay_id, stay_date);
create index care_medication_instructions_stay_date_idx
  on public.care_medication_instructions(hotel_stay_id, stay_date);
