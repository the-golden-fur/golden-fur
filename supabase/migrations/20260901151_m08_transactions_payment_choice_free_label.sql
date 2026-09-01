-- Payment/transactions model rework (feat/payment-transactions-rework), 2/8.
--
-- WHY: 20260809118 added transactions.payment_choice ('full' | 'downpayment')
-- purely as a hint for the customer-initiated PayMongo webhook, and coupled
-- it to initiated_by = 'customer' via
-- transactions_payment_choice_requires_customer_initiated. In the reworked
-- model a booking_payment row can also be created by staff (see
-- add_booking_payment() later in this series) and carries a 'balance' choice,
-- so payment_choice becomes a free label independent of who initiated the
-- row.
--
--   * drop the initiated_by coupling CHECK entirely.
--   * widen the value CHECK to allow 'full' | 'downpayment' | 'balance'
--     (kept as a CHECK rather than dropped so the column stays a known set).
--
-- transactions_payment_choice_check is the auto-generated name Postgres gave
-- the inline `check (payment_choice in (...))` in 20260809118 (only column
-- referenced is payment_choice).

alter table public.transactions
  drop constraint transactions_payment_choice_requires_customer_initiated;

alter table public.transactions
  drop constraint transactions_payment_choice_check;

alter table public.transactions
  add constraint transactions_payment_choice_check
    check (payment_choice is null
           or payment_choice in ('full', 'downpayment', 'balance'));
