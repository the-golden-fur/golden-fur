-- Multi-booking checkout (see booking_groups - 20260906173): a settlement
-- for a cart of bookings needs to attach to the group as a whole rather than
-- to any single booking, so transactions gets a second, mutually-exclusive
-- FK alongside booking_id. transactions_booking_id_matches_type
-- (20260731068) previously required exactly one shape per transaction_type
-- (booking_id null for miscellaneous_sale, booking_id not null for
-- booking_payment); it is now widened so a booking_payment row satisfies it
-- via EITHER booking_id (single-booking checkout, unchanged) OR
-- booking_group_id (new multi-booking checkout), never both, and a
-- miscellaneous_sale row still has neither. Every row that satisfied the old
-- constraint still satisfies the new one - booking_group_id does not exist
-- before this migration, so it is null on every existing row, and "booking_id
-- is not null and booking_group_id is null" is exactly the old
-- booking_payment shape - so no backfill is needed.

alter table public.transactions
  add column booking_group_id uuid references public.booking_groups(id);

create index transactions_booking_group_id_idx on public.transactions(booking_group_id);

alter table public.transactions
  drop constraint transactions_booking_id_matches_type;

alter table public.transactions
  add constraint transactions_booking_id_matches_type check (
    (transaction_type = 'miscellaneous_sale' and booking_id is null and booking_group_id is null)
    or (transaction_type = 'booking_payment' and (
      (booking_id is not null and booking_group_id is null)
      or (booking_id is null and booking_group_id is not null)
    ))
  );
