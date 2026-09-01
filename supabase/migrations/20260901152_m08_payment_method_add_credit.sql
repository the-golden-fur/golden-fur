-- Payment/transactions model rework (feat/payment-transactions-rework), 3/8.
--
-- WHY: the reworked payments flow lets a customer settle a booking balance
-- with previously-issued account credit (redeem_credit(), later in this
-- series), which is recorded as a transactions row whose payment_method is
-- 'Credit'. Adds that value to the payment_method enum (from 20260731068:
-- Cash, GCash, Maya, Card, Bank Transfer, Grabmart, Pickaroo).
--
-- Kept in its own migration file with nothing else in it: `alter type ... add
-- value` and any statement that then USES the new value cannot run in the
-- same transaction, and Supabase wraps each migration file in one
-- transaction. Every consumer of the new value lives in a later file.

alter type public.payment_method add value if not exists 'Credit';
