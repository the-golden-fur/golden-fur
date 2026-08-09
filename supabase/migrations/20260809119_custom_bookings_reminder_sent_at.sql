-- Configurable appointment-reminder timing (customer Settings > Preferences):
-- the reminder job used to run once/day at a fixed 8am and check "tomorrow"
-- bookings, which can't honor a per-customer offset (15 min / 1h / 3h / 1
-- day / 2 days before). It now polls every 15 minutes instead - this column
-- is the dedupe marker so a booking is only ever reminded once regardless
-- of how many poll ticks pass after its fire time, independent of whether
-- createNotification actually inserted a notifications row (a customer who
-- disabled both channels for this event still only gets checked once, not
-- re-evaluated every 15 minutes for the rest of the lookahead window).

alter table public.bookings
  add column reminder_sent_at timestamptz;
