-- Sprint 5 Epic B (#89): cancellation_logs table.
--
-- Logs every cancellation/reschedule event and its policy outcome,
-- regardless of whether credit was actually issued, so Admin/Supervisor
-- dashboards always have a complete record (Modules-Features). Written by
-- server/src/features/booking/services/cancellationLog.service.ts (#91),
-- called from both cancellation.service.ts and reschedule.service.ts.
--
-- event_type is plain text, not an enum, matching the established
-- transaction_line_items.line_item_type convention (Sprint 5 Epic A).
-- Documented allowed values: 'cancellation', 'reschedule'.
--
-- enforcement_mode_applied reuses the pre-existing public.enforcement_mode
-- enum (created by 20260718037, Sprint 2 #52) - a snapshot of
-- policy_configurations.notice_enforcement_mode at event time, since the
-- configuration can change after the fact.
--
-- customer_id/branch_id are denormalized here (rather than derived
-- transitively through booking_id), mirroring transactions' own
-- denormalization rationale (Sprint 5 Epic A), so dashboards can filter
-- without a join through bookings.

create table public.cancellation_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  customer_id uuid not null references public.customer_profiles(id),
  branch_id uuid not null references public.branches(id),
  event_type text not null check (event_type in ('cancellation', 'reschedule')),
  notice_period_met boolean not null,
  enforcement_mode_applied public.enforcement_mode not null,
  -- True only for a Soft-mode event where notice was not met.
  policy_violation boolean not null default false,
  credit_issued boolean not null default false,
  -- Populated only when credit_issued = true.
  credit_amount numeric(10, 2)
    check (credit_amount is null or credit_amount >= 0),
  -- Populated only for event_type = 'reschedule' when a fee applied.
  reschedule_fee_charged numeric(10, 2)
    check (reschedule_fee_charged is null or reschedule_fee_charged >= 0),
  notes text,
  created_at timestamptz not null default now(),
  constraint cancellation_logs_credit_amount_requires_issued check (
    (credit_issued and credit_amount is not null)
    or (not credit_issued and credit_amount is null)
  ),
  constraint cancellation_logs_reschedule_fee_matches_type check (
    reschedule_fee_charged is null or event_type = 'reschedule'
  )
);

create index cancellation_logs_booking_id_idx on public.cancellation_logs(booking_id);
create index cancellation_logs_customer_id_idx on public.cancellation_logs(customer_id);
create index cancellation_logs_branch_id_idx on public.cancellation_logs(branch_id);

alter table public.cancellation_logs enable row level security;

-- Read-only for staff (AC-2): Admin/Supervisor/Superadmin, per the Guide's
-- own AC-2 wording. Write access has no `authenticated` policy at all -
-- only the server's service-role client (which bypasses RLS entirely,
-- Supabase's standard behavior) ever inserts a row, matching the "server-
-- role client, application-layer inserts only" requirement.
create policy "Admins and supervisors can read cancellation logs"
  on public.cancellation_logs
  for select
  to authenticated
  using (
    public.current_staff_role() in ('Superadmin', 'Admin', 'Supervisor')
  );
