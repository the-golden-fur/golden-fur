-- M05: nightly care-summary send ledger.
--
-- WHY: care_log_daily_report_enabled (previous migration) turns on one
-- customer email per active hotel stay per night, summarising that day's care
-- tasks. careLogDailyReport.job.ts polls hourly from 21:00 onward; this table
-- is the once-per-(stay, date) claim so a stay is never emailed twice for the
-- same day, whether from a later poll tick that same evening or a server
-- restart. Same single-writer pattern as bookings.reminder_sent_at - the job
-- does `upsert ... ignoreDuplicates` and only sends if it wins the row.
--
-- Runtime-only table (no supabase/seeds/** entry) - rows are written solely by
-- the job's service-role client.

create table public.care_log_daily_reports (
  stay_id uuid not null references public.stays(id) on delete cascade,
  report_date date not null,
  sent_at timestamptz not null default now(),
  primary key (stay_id, report_date)
);

comment on table public.care_log_daily_reports is
  'One row per (hotel stay, calendar date) for which the nightly care-summary email was sent. Claim ledger for careLogDailyReport.job.ts - prevents duplicate sends against the Brevo daily quota.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- No authenticated-role policy at all: this table is written and read only by
-- the job's service-role client (which bypasses RLS), never surfaced to staff
-- or customers. Enabling RLS with no policy = deny-all for authenticated
-- callers, matching the "service-role only" intent.

alter table public.care_log_daily_reports enable row level security;
