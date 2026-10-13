-- Custom change (book before assessment): a pet that staff have not assessed
-- yet (no weight class / coat type) could only book "Initial Assessment" -
-- every other service and every package was refused. A customer can now book
-- anything for such a pet; the real price and the payment are settled at the
-- counter once the pet has been assessed on arrival.
--
-- awaiting_assessment marks a booking made that way:
--   - its price is only an ESTIMATE (the base/package price, no size or coat
--     cell), and
--   - no charge has been created for it yet - nothing is paid online.
--
-- It is cleared when staff record the pet's weight and coat: the booking is
-- repriced to the pet's real price and its bill is posted for the cashier
-- (booking/services/assessmentReprice.service.ts). Distinct from
-- pay_at_checkout (20261005244), which is a Walk-in Hotel/Daycare stay billed
-- at checkout by the time actually stayed.
--
-- No new table, so no new RLS policy or archive trigger.

alter table public.bookings
  add column awaiting_assessment boolean not null default false;

comment on column public.bookings.awaiting_assessment is
  'True while the booking was made for a pet not yet assessed: total_price is an estimate and no charge exists. Cleared (with the booking repriced and its bill posted) when staff record the pet''s weight class and coat type.';

-- Staff look up "which of this pet's bookings are still waiting" on every
-- assessment save; almost no rows carry the flag.
create index bookings_awaiting_assessment_pet_idx
  on public.bookings (pet_id)
  where awaiting_assessment;
