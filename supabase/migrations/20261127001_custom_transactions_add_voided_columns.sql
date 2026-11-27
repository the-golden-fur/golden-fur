-- Transactions page bug report: a booking that auto-cancels (e.g.
-- applyDownpaymentExpiry) can leave behind a Pending 'balance'
-- booking_payment transaction with nowhere to go - Pay is correctly hidden
-- for it (transactionPayment.service.ts already refuses collecting money
-- against a cancelled booking, 409), but there was previously no way to
-- clear the dead charge out of the Transactions page's "Due payment" list
-- either. It would otherwise sit there forever.
--
-- Deliberately NOT a new public.payment_status enum value: that type is
-- shared with bookings.payment_status (20260901150), and several reporting
-- queries/RPCs filter transactions by payment_status - voiding is kept as
-- its own pair of columns instead, orthogonal to payment_status, exactly
-- the same shape as the existing reviewed_by/reviewed_at pattern
-- (bug_reports, 20261102003). A voided transaction's payment_status stays
-- 'Pending' - every money-moving query in transactionPayment.service.ts /
-- checkoutExtrasCharge.service.ts already scopes to an active (non-
-- cancelled) booking, so a voided row never re-enters any of those; the
-- Transactions page is the only reader that needs to tell a live Pending
-- charge apart from a voided one, which it does via voided_at.
alter table public.transactions
  add column voided_at timestamptz,
  add column voided_by uuid references public.staff_profiles(id);

comment on column public.transactions.voided_at is
  'Set when a Pending booking_payment charge is voided (its booking was cancelled, so it can never be paid) - displays as "Voided" instead of "Due payment" and hides the stale charge from reports that act on open balances. Null for every other row.';
comment on column public.transactions.voided_by is
  'The staff member who voided this transaction. Null unless voided_at is set.';
