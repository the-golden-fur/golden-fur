-- M03 booking-lifecycle unification: replaces the ad-hoc 'Confirmed' payment
-- gate with a single, fully-automated status vocabulary that Grooming/
-- Veterinary/Hotel (and, where a booking exists, Daycare) now drive instead
-- of maintaining their own separate status column - see the migrations
-- immediately following this one for grooming_sessions/consultations/
-- hotel_stays. No manual "staff confirms a booking" step ever existed in the
-- app (status was always set automatically in booking.service.ts); the
-- 'Confirmed' label just read as if one did, so it's retired outright
-- rather than relabeled.
--
-- New lifecycle: Pending (booked, appointment hasn't started - every new
-- booking starts here now, regardless of payment method or category) ->
-- In Progress (staff started the service - a manual Start action, or
-- physical check-in for Hotel/Daycare) -> Completed (service finished - a
-- manual Complete action or checkout) -> Paid (payment settled -
-- automatic immediately on Complete when payment_method is an online
-- method AND payment_confirmed was already true, otherwise a manual Mark
-- as Paid action). No-show is a lazy, read-time transition (no cron infra
-- exists in this app): any Pending booking whose scheduled_start has
-- passed is flipped to No-show the next time it's read - see
-- booking.service.ts's applyNoShowTransition. Cancelled is unchanged.
--
-- started_at/completed_at/paid_at (added below) replace the same-purpose
-- columns being dropped from grooming_sessions/consultations in the
-- following migrations - one audit trail on the booking itself instead of
-- a different column per module.

create type public.booking_status_new as enum (
  'Pending',
  'In Progress',
  'Completed',
  'Paid',
  'Cancelled',
  'No-show'
);

alter table public.bookings
  alter column status drop default;

-- Must be dropped BEFORE the column's type changes below - Postgres rebuilds
-- a dependent index's predicate expression against the new column type when
-- ALTER COLUMN ... TYPE runs, and this index's predicate (status =
-- 'Confirmed') would then try to compare the new enum type against an old-
-- enum-typed 'Confirmed' literal ("operator does not exist: booking_status_new
-- = booking_status"). Recreated below, after the rename, with the new
-- predicate.
drop index if exists public.bookings_staff_confirmed_idx;

-- Backfill heuristic for this dev/seed database (no real production data to
-- preserve): old 'Confirmed' becomes 'Pending' (payment being settled no
-- longer implies the appointment has started). Old 'Completed' becomes
-- 'Paid' when payment_confirmed was already true or the category is
-- Veterinary's own no-payment-gate case - the closest equivalent to "this
-- record was already fully settled" under the old model - otherwise it
-- becomes the new 'Completed' (service finished, payment still owed).
alter table public.bookings
  alter column status type public.booking_status_new
  using (
    case status::text
      when 'Confirmed' then 'Pending'
      when 'Completed' then (
        case
          when payment_confirmed or service_category = 'Veterinary'
            then 'Paid'
          else 'Completed'
        end
      )
      when 'Cancelled' then 'Cancelled'
      when 'No-show' then 'No-show'
      else 'Pending'
    end
  )::public.booking_status_new;

alter table public.bookings
  alter column status set default 'Pending';

drop type public.booking_status;
alter type public.booking_status_new rename to booking_status;

-- Replaces the retired partial index dropped above (its predicate
-- referenced 'Confirmed', which no longer exists) - the new predicate
-- matches every status that still holds a real staff-time slot going
-- forward, mirroring booking.types.ts's ACTIVE_BOOKING_STATUSES.
create index bookings_staff_active_idx
  on public.bookings(assigned_staff_id, scheduled_start)
  where status in ('Pending', 'In Progress', 'Completed', 'Paid');

alter table public.bookings
  add column started_at timestamptz,
  add column completed_at timestamptz,
  add column paid_at timestamptz;
