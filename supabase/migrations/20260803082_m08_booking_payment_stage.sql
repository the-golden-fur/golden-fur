-- Adds a payment_stage track to bookings, independent of the existing
-- `status` lifecycle (Pending -> In Progress -> Completed -> Paid). A
-- cashier (or other money-handling staff) manually advances this via a
-- separate "Advance" action: Unpaid -> Paid in Advance (money collected
-- before the service happens) or straight to Paid (a normal onsite payment,
-- collected once in full), and Paid in Advance -> Paid once the balance is
-- later settled. This is additive to the existing status='Paid' step
-- (markBookingPaid) and the separate Cashier Checkout/transactions flow
-- (checkoutAggregation.service.ts) - it does not replace either.

create type public.payment_stage as enum ('Unpaid', 'Paid in Advance', 'Paid');

alter table public.bookings
  add column payment_stage public.payment_stage not null default 'Unpaid';

create index bookings_payment_stage_idx on public.bookings(payment_stage);
