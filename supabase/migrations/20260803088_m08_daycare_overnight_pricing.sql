-- Booking flow & pricing revamp (#22): a daycare pet not picked up before
-- the branch closes now accrues a flat per-night overnight fee on top of
-- the existing first-hour/succeeding-hour charge, e.g. two nights unclaimed
-- = 2 * daycare_overnight_fee + 100 + (succeeding hours * 50). Reuses the
-- existing pricing_configuration singleton (Admin/Superadmin-editable, see
-- 20260726047) rather than a new table - it is already the shared home for
-- an admin-tunable pricing constant.

alter table public.pricing_configuration
  add column daycare_overnight_fee numeric(10, 2) not null default 850.00
  check (daycare_overnight_fee >= 0);
