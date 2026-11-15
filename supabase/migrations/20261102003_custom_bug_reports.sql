-- Custom change: bug report / feature request submissions, reachable from
-- the floating mascot widget for both customers and staff. A Developer (or
-- Superadmin, for oversight) reviews every submission from a queue page and
-- moves it through a simple status lifecycle.
--
-- reporter_customer_id/reporter_staff_id: exactly one of the two is set,
-- mirroring notifications.recipient_staff_id/recipient_customer_id's
-- "exactly one of" pattern rather than a polymorphic reporter_type +
-- reporter_id pair.

create type public.bug_report_category as enum ('bug', 'feature_request');

create type public.bug_report_status as enum (
  'pending',
  'in_progress',
  'resolved',
  'dismissed'
);

create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_customer_id uuid references public.customer_profiles(id),
  reporter_staff_id uuid references public.staff_profiles(id),
  category public.bug_report_category not null,
  title text not null,
  description text not null,
  status public.bug_report_status not null default 'pending',
  reviewed_by uuid references public.staff_profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bug_reports_exactly_one_reporter check (
    num_nonnulls(reporter_customer_id, reporter_staff_id) = 1
  )
);

create index bug_reports_status_idx on public.bug_reports(status);
create index bug_reports_created_at_idx on public.bug_reports(created_at);

alter table public.bug_reports enable row level security;

-- Written exclusively by the server's service-role client (createBugReport
-- runs for both a customer and a staff submitter) - no insert policy, same
-- convention as the notifications table
-- (20260805100_m11_create_notifications_schema.sql).
create policy "Developers and superadmins can read bug reports"
  on public.bug_reports
  for select
  to authenticated
  using (public.current_staff_role() in ('Developer', 'Superadmin'));

create policy "Developers and superadmins can update bug reports"
  on public.bug_reports
  for update
  to authenticated
  using (public.current_staff_role() in ('Developer', 'Superadmin'))
  with check (public.current_staff_role() in ('Developer', 'Superadmin'));

create trigger trg_archive_deleted_row
  after delete on public.bug_reports
  for each row execute function public.archive_deleted_row();
