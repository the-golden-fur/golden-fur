-- Payment/transactions model rework (feat/payment-transactions-rework), 1/8.
--
-- WHY: bookings.payment_stage (enum payment_stage = Unpaid / Paid in Advance
-- / Paid, added by 20260803082) was a bespoke, manually-advanced track that
-- duplicated the concept the M08 payment_status enum (Pending / Partially
-- Paid / Fully Paid, from 20260731068) already models for transactions. The
-- rework makes a booking's payment state a straight rollup of its
-- transactions rows, so it now reuses that same enum on bookings and is kept
-- current by settle_transaction() / add_booking_payment() (later migrations
-- in this series) instead of a separate "Advance" action.
--
-- Mapping applied to existing rows:
--   Unpaid          -> Pending
--   Paid in Advance -> Partially Paid
--   Paid            -> Fully Paid
--
-- bookings_downpayment_gate_idx (20260808111) is a partial index on
-- (downpayment_required, payment_stage); Postgres would auto-drop it with the
-- column, so it is explicitly dropped and recreated against payment_status to
-- keep the down-payment slot-gate lookup covered.

alter table public.bookings
  add column payment_status public.payment_status not null default 'Pending';

update public.bookings
set payment_status = case payment_stage
  when 'Unpaid' then 'Pending'::public.payment_status
  when 'Paid in Advance' then 'Partially Paid'::public.payment_status
  when 'Paid' then 'Fully Paid'::public.payment_status
end;

drop index if exists public.bookings_payment_stage_idx;
drop index if exists public.bookings_downpayment_gate_idx;

alter table public.bookings drop column payment_stage;

drop type public.payment_stage;

create index bookings_payment_status_idx on public.bookings(payment_status);

-- Same shape as the index 20260808111 created, re-pointed at payment_status.
-- The gate now fires while payment_status = 'Pending' (was payment_stage =
-- 'Unpaid').
create index bookings_downpayment_gate_idx
  on public.bookings (downpayment_required, payment_status)
  where downpayment_required = true;

comment on column public.bookings.payment_status is
  'Rollup of this booking''s transactions rows (Pending / Partially Paid / Fully Paid). Maintained by settle_transaction() and add_booking_payment(); do not write directly. Replaced the bespoke payment_stage column (20260803082) in the payment/transactions rework.';
