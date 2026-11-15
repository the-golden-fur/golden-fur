-- Custom change (Front Desk Queue): reception can now start and complete
-- services on behalf of the groomer/vet, so a booking has to remember who
-- actually pressed the button. Nothing recorded this before - bookings only
-- had started_at/completed_at. Nullable: bookings advanced before this
-- migration have no known actor.
alter table public.bookings
  add column started_by_staff_id uuid references public.staff_profiles(id),
  add column completed_by_staff_id uuid references public.staff_profiles(id);
