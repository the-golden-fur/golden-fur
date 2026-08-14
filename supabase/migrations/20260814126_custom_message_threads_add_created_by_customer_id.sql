-- Custom change (Gmail-style messaging redesign): Mail threads can now be
-- created by a customer, not just staff (Announcement senders) - widens
-- message_threads' creator to the same exactly-one-of pattern already used
-- for participants/senders elsewhere in this schema. Existing rows all
-- already have created_by_staff_id set and created_by_customer_id defaults
-- null, so num_nonnulls = 1 holds with no backfill.

alter table public.message_threads
  alter column created_by_staff_id drop not null;

alter table public.message_threads
  add column created_by_customer_id uuid references public.customer_profiles(id);

alter table public.message_threads
  add constraint message_threads_exactly_one_creator check (
    num_nonnulls(created_by_staff_id, created_by_customer_id) = 1
  );
