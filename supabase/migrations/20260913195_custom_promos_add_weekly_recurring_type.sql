-- Custom change (promo variations, session 86): a second promo "type"
-- alongside the existing date-range one - "every Monday, 10% off Grooming".
--
-- promo_type is a discriminator; existing promos default to 'date_range' so
-- nothing already seeded/created changes behavior. start_date/end_date
-- remain valid (and optional) even for a weekly_recurring promo - they bound
-- an OVERALL campaign window on top of the day-of-week match (both null =
-- recurs indefinitely on those weekdays).
--
-- days_of_week uses 0=Sunday..6=Saturday, matching both JS's
-- Date#getDay()/Date#getUTCDay() and Postgres's extract(dow from ...), so
-- neither side of the stack needs to remap the value.

create type public.promo_type as enum ('date_range', 'weekly_recurring');

alter table public.promos
  add column promo_type public.promo_type not null default 'date_range',
  add column days_of_week integer[];

alter table public.promos
  add constraint promos_days_of_week_valid check (
    days_of_week is null
    or (
      array_length(days_of_week, 1) > 0
      and days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]
    )
  ),
  add constraint promos_weekly_recurring_needs_days check (
    promo_type <> 'weekly_recurring' or days_of_week is not null
  ),
  add constraint promos_date_range_no_days check (
    promo_type = 'weekly_recurring' or days_of_week is null
  );

comment on column public.promos.days_of_week is
  'Only set when promo_type = weekly_recurring. 0=Sunday..6=Saturday '
  '(Manila-local day). start_date/end_date, if set, bound the overall '
  'campaign window IN ADDITION to the day-of-week match; if null the promo '
  'recurs indefinitely on those weekdays.';
