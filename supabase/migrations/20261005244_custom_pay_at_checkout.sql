-- Custom change (pay at checkout): an owner who walks in may not know how
-- long their pet will stay, so a Walk-in Hotel/Daycare booking can now be
-- created with nothing charged up front. The counter starts at check-in
-- (stays.check_in_at) and checkout posts one Pending 'balance' transaction
-- for the time actually stayed (payAtCheckoutCharge.service.ts), which the
-- cashier collects as usual.
--
--   policy_configurations.pay_at_checkout_enabled       - per-branch on/off,
--     on by default (the column default fills every existing row too).
--   policy_configurations.pay_at_checkout_grace_minutes - Daycare bills a
--     partial hour as a whole one; this many minutes past the hour are not
--     billed as another hour on a pay-at-checkout stay. 0 turns it off.
--   bookings.pay_at_checkout / booking_groups.pay_at_checkout - marks the
--     booking (and, for a multi-booking checkout, its shared payment unit)
--     as billed at checkout. Such a booking has no transaction until then.
--
-- No RPC change: create_initial_booking_charge / _group_charge are simply
-- not called for these bookings. No new RLS: the existing policies on all
-- three tables already cover the whole row.

alter table public.policy_configurations
  add column pay_at_checkout_enabled boolean not null default true,
  add column pay_at_checkout_grace_minutes integer not null default 10
    check (pay_at_checkout_grace_minutes between 0 and 59);

alter table public.bookings
  add column pay_at_checkout boolean not null default false;

alter table public.booking_groups
  add column pay_at_checkout boolean not null default false;
