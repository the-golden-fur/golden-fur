-- Custom change: Cage Picker addendum - lets a Hotel booking record the
-- customer/receptionist's preferred cage at booking time, mirroring the
-- role staff_preference already plays for Grooming/Veterinary bookings.
-- Unlike staff_preference this never hard-assigns anything by itself - a
-- cage's `status` is untouched here. Check-in's existing suggestCage/
-- assignCage flow (hotel/services/cageAssignment.service.ts) still performs
-- the real, concurrency-safe claim; this column only lets that flow
-- pre-select what the customer already asked for at booking time. NULL =
-- no preference (today's behavior, unchanged).

alter table public.bookings
  add column preferred_cage_id uuid references public.cages(id);
