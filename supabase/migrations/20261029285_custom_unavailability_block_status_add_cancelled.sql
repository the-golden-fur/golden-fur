-- Custom change (Day Off Requests queue): a staff member cancelling their
-- own request now marks it 'cancelled' instead of deleting the row, so it
-- stays in their request history (cancelUnavailabilityBlock). A manager
-- removing an entry from the Monthly Schedule still deletes it.
--
-- Cancelled rows never count as time off: availability/booking queries
-- already filter status = 'approved', and the overlap / auto-build /
-- schedule queries filter to ('approved', 'pending').
--
-- Own migration, same reason as 20261029284: Postgres forbids using a value
-- added by ADD VALUE in the transaction that added it.

alter type public.unavailability_block_status add value 'cancelled';
