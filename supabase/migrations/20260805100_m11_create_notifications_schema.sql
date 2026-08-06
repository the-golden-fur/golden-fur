-- Sprint 6 Epic A (#96): M11 Notification - notification_event_type enum and
-- the notifications table.
--
-- Numbering note: the Sprint6-EpicA-Guide assumed the latest merged
-- migration was 20260805097. The actual latest when this branch started was
-- 20260804093 - but Sprint 5 Epic B (#88-#95, credit/cancellation-policy)
-- landed on dev (commit 140a0c4) mid-branch, taking 094-099 for itself. This
-- epic's migrations are therefore renumbered a second time, to 100-101,
-- matching how every prior epic's Guide has flagged (and needed) exactly
-- this kind of renumbering.
--
-- Corrects a stale "Merged" tag in Modules-Overview's DB Entities Inventory -
-- reading booking.service.ts's sendBookingCreatedNotificationStub() and
-- careLogCompletion.service.ts's fireCareLogCompletedEvent() (both carry
-- explicit "TODO(Sprint 6, M11)" comments) and finding no prior migration
-- for either the table or the enum anywhere in supabase/migrations/ confirms
-- this is a genuine CREATE, not an ALTER.

-- ---------------------------------------------------------------------------
-- notification_event_type
-- ---------------------------------------------------------------------------
-- The one genuinely new enum this epic introduces - no prior M11 stub of any
-- kind exists to extend. Exact 8 values per Modules-Features.

create type public.notification_event_type as enum (
  'account_created',
  'password_reset',
  'booking_confirmed',
  'booking_rescheduled',
  'payment_confirmed',
  'appointment_reminder',
  'booking_cancelled',
  'care_log_completed'
);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
-- recipient_staff_id/recipient_customer_id: exactly one of the two is set,
-- mirroring booking_items.service_id/package_id's exactly-one-of pattern
-- rather than a polymorphic recipient_type + recipient_id pair.
--
-- related_booking_id is nullable and populated for every event type except
-- account_created/password_reset (neither has a booking to link to).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_staff_id uuid references public.staff_profiles(id),
  recipient_customer_id uuid references public.customer_profiles(id),
  event_type public.notification_event_type not null,
  title text not null,
  message text not null,
  related_booking_id uuid references public.bookings(id),
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_exactly_one_recipient check (
    num_nonnulls(recipient_staff_id, recipient_customer_id) = 1
  )
);

create index notifications_recipient_staff_id_idx
  on public.notifications(recipient_staff_id)
  where recipient_staff_id is not null;
create index notifications_recipient_customer_id_idx
  on public.notifications(recipient_customer_id)
  where recipient_customer_id is not null;
create index notifications_created_at_idx on public.notifications(created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- A staff member may SELECT only rows where recipient_staff_id = auth.uid();
-- a customer may SELECT only rows where recipient_customer_id = auth.uid().
-- No staff or customer INSERT policy for either role - rows are created
-- exclusively by the server's service-role client (notification.service.ts,
-- Issue #97), matching the established "only appropriate write paths can
-- mutate" convention (e.g. transactions' insert policy scoped to
-- money-handling roles rather than left open to every authenticated user).
--
-- UPDATE (marking read) is scoped the same way as SELECT - restricted to the
-- is_read column only at the application layer, not by column-level RLS.

alter table public.notifications enable row level security;

create policy "Staff can read their own notifications"
  on public.notifications
  for select
  to authenticated
  using (recipient_staff_id = auth.uid());

create policy "Customers can read their own notifications"
  on public.notifications
  for select
  to authenticated
  using (recipient_customer_id = auth.uid());

create policy "Staff can mark their own notifications read"
  on public.notifications
  for update
  to authenticated
  using (recipient_staff_id = auth.uid())
  with check (recipient_staff_id = auth.uid());

create policy "Customers can mark their own notifications read"
  on public.notifications
  for update
  to authenticated
  using (recipient_customer_id = auth.uid())
  with check (recipient_customer_id = auth.uid());
