-- Admin-configurable transactional-email behaviour (Brevo quota controls).
--
-- WHY: the Brevo free plan caps sends at 300/day. Two flows were the biggest
-- avoidable drains:
--   1. Multi-booking checkout sent one "booking confirmed" email per pet in
--      the cart. Default is now ONE combined email per checkout; an admin can
--      switch back to one-per-booking.
--   2. The hotel care-log emailed the customer on every single completed task
--      (feeding / walk / meds - many per pet per day). Per-task email is now
--      OFF by default; instead a single nightly summary per stay is ON by
--      default (see care_log_daily_reports, next migration).
--
-- Follows the policy_configurations column pattern (20260908178
-- max_concurrent_bookings_per_staff, 20260902166 booking_notice_period): NOT
-- NULL columns with a documented default, seeded onto every existing row
-- (default + per-branch overrides) by the default itself. policy_configurations
-- is migration-seeded only - no supabase/seeds/** file.

alter table public.policy_configurations
  add column booking_group_email_mode text not null default 'combined'
    check (booking_group_email_mode in ('combined', 'per_booking')),
  add column care_log_task_email_enabled boolean not null default false,
  add column care_log_daily_report_enabled boolean not null default true;

comment on column public.policy_configurations.booking_group_email_mode is
  'Multi-booking checkout confirmation email: ''combined'' = one email listing every booking in the cart (default); ''per_booking'' = one email per booking. In-app notification rows are always one per booking regardless.';

comment on column public.policy_configurations.care_log_task_email_enabled is
  'When true, email the customer as each hotel care-log task is completed. Default false (in-app notification still fires) - the nightly summary covers the customer instead.';

comment on column public.policy_configurations.care_log_daily_report_enabled is
  'When true (default), send the customer one nightly summary email per active hotel stay listing that day''s completed / missed / still-open care tasks.';
