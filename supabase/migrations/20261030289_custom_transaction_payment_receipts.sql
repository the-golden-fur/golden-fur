-- Custom change (payment receipts): Cashier / Front Desk staff can attach a
-- receipt file when marking a transaction as paid on the Transactions page -
-- mainly the proof for a non-cash payment (a GCash/Maya confirmation
-- screenshot, a card slip, a bank transfer receipt). Optional for every
-- method; a receipt can also be added to an already-Paid transaction later.
--
-- Same shape as vaccination card photos (20261021277): files go in their own
-- PRIVATE bucket ('payment-receipts') - they can show account names and
-- numbers. Only the server's service-role client reads or writes it, handing
-- out short-lived signed links, so it needs no storage policies.
-- receipt_path is the object's path in that bucket, never a URL.
--
-- No RLS changes: the upload goes through the server (BILLING_STAFF_ROLES).
-- All new columns are nullable, so no seed changes are needed.

alter table public.transactions
  add column receipt_path text,
  add column receipt_uploaded_by uuid references public.staff_profiles(id),
  add column receipt_uploaded_at timestamptz;

comment on column public.transactions.receipt_path is
  'Path of the payment receipt file in the private payment-receipts bucket (never a URL). Read only through signed links from the server.';

insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false)
on conflict (id) do nothing;
