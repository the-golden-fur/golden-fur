-- Moves Initial Assessment (...074) and Reassessment (...076) out of
-- Grooming into the new Misc category (...079) - they were never really
-- Grooming services, just administrative pet-assessment bookings that
-- happened to live there for lack of a better category. booking.service.ts
-- already skips staff-assignment/capacity checks for any category other
-- than Grooming/Veterinary/Hotel/Daycare, so Misc needs no new resource
-- logic - it falls through to "just create the booking" automatically.
--
-- Booking-time gating (an unassessed pet can only book Initial Assessment)
-- moves with it - the application layer (CustomerBookingFlowPage.tsx,
-- booking.service.ts) is updated in the same change to look for
-- category = 'Misc' instead of 'Grooming'.

update public.services
set category = 'Misc'
where id in (
  'a1300000-0000-4000-a000-000000000022', -- Initial Assessment
  'a1300000-0000-4000-a000-000000000023'  -- Reassessment
);
