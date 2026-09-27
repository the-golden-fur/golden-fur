-- Custom change (session 115): the PayMongo online-payment integration was
-- torn out - GCash/Maya are now plain manual payment-method labels,
-- confirmed by a cashier immediately like Cash. These columns only ever
-- recorded facts about that webhook-driven flow and nothing reads or
-- writes them any more: transactions.webhook_confirmed_at (set only by the
-- now-deleted webhook confirmation path) and transactions.initiated_by
-- (distinguished a customer-initiated PayMongo checkout from a
-- staff-recorded one). policy_configurations.online_payments_enabled was
-- the admin on/off toggle for that same flow. transactions.payment_choice
-- is untouched - it is a free label used by every booking payment
-- regardless of method, unrelated to PayMongo specifically.

alter table public.transactions
  drop column if exists webhook_confirmed_at,
  drop column if exists initiated_by;

alter table public.policy_configurations
  drop column if exists online_payments_enabled;
