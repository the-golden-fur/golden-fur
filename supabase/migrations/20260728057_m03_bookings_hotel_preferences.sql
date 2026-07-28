-- M03 Booking flow revision: bookings.hotel_preferences - a customer/
-- receptionist-entered, freetext preview of feeding/walking/medication
-- preferences for a Hotel booking, captured during booking creation (before
-- the pet has arrived). This is intentionally separate from the M05
-- care_feeding_instructions/care_walking_instructions/care_medication_
-- instructions tables, which remain the staff-only, structured, billable
-- record captured at physical check-in (hotel_stays) - see
-- 20260727052_m05_create_care_instructions_schema.sql. hotel_preferences has
-- no catalog linkage and no pricing; it exists only so the check-in form can
-- be pre-filled instead of starting blank, saving the receptionist from
-- re-typing what the customer already said at booking time. NULL for every
-- non-Hotel booking, and optional even for Hotel bookings (nothing entered
-- at booking time is a valid state - the receptionist still captures the
-- authoritative record at check-in either way).
alter table public.bookings
  add column hotel_preferences jsonb;
