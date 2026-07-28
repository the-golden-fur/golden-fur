-- M07 follow-up (booking-status unification): consultations no longer
-- tracks its own lifecycle status or completed_at timestamp - both now live
-- solely on the parent bookings row (bookings.status/completed_at), driven
-- by the same Start/Complete/Mark as Paid actions every other category
-- uses. consultations.booking_id is NOT NULL (every consultation belongs to
-- exactly one Veterinary booking), so nothing is lost by dropping these
-- columns - every read that used consultations.status/completed_at now
-- joins to bookings instead (currentPrescription.service.ts,
-- consultation.service.ts's queue queries).

alter table public.consultations
  drop column status,
  drop column completed_at;
