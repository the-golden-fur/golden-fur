-- Customer self-service "Pay" button (booking payments page): a customer
-- can now pay their own booking online via PayMongo, creating a
-- booking_payment transaction the same way the cashier checkout flow
-- (checkoutBooking) already does - reusing the exact same table and the
-- exact same webhook reconciliation (confirmPaymongoWebhookEvent flips
-- Pending -> Fully Paid by payment_reference, unchanged).
--
-- Two new columns distinguish these customer-initiated rows so the webhook
-- can additionally advance the booking's payment_stage once one is
-- confirmed (bookings.payment_stage is otherwise only ever moved by a
-- staff Mark-as-Paid action or at booking creation - see
-- advancePaymentStage in booking.service.ts, reused as-is for this) without
-- changing any existing cashier-checkout behavior, which never sets these:
--
-- initiated_by: who created this transaction - 'staff' (default, matches
-- every pre-existing row) or 'customer'.
-- payment_choice: only meaningful for a customer-initiated booking_payment
-- row - 'full' or 'downpayment', so the webhook knows which
-- advancePaymentStage target applies.

alter table public.transactions
  add column initiated_by text not null default 'staff'
    check (initiated_by in ('staff', 'customer')),
  add column payment_choice text
    check (payment_choice in ('full', 'downpayment')),
  add constraint transactions_payment_choice_requires_customer_initiated
    check (payment_choice is null or initiated_by = 'customer');
