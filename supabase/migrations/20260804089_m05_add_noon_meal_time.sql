-- Care Instructions revision: feeding becomes a free add/remove list (like
-- walking/playing/medication already are) instead of three fixed
-- Morning/Afternoon/Evening checkboxes, and gains a "Noon" time-of-day
-- option on that list. Scoped to care_feeding_instructions.meal_time only -
-- care_walking_instructions/care_playing_instructions.time_block stay
-- Morning/Afternoon/Evening (walk/play scheduling wasn't asked to change).

alter table public.care_feeding_instructions
  drop constraint care_feeding_instructions_meal_time_check,
  add constraint care_feeding_instructions_meal_time_check
  check (meal_time in ('Morning', 'Noon', 'Afternoon', 'Evening'));
