-- Custom change (Late booking status): how long a booking stays 'Late'
-- (start time passed, still startable) before it becomes 'No-show'.
-- Previously a Pending booking became No-show the instant scheduled_start
-- passed, with no grace period.
--
-- Two knobs, set together from Config > Policy Configuration's "Mark as
-- no-show after" dropdown (15 min / 30 min / 1 h / 2 h / End of operating
-- hours):
--   * no_show_after_minutes - minutes after scheduled_start. Default 30.
--   * no_show_at_closing    - when true, wait until the branch's closing
--     time (branches.operating_hours, branch timezone) on the booking's day
--     instead; no_show_after_minutes is then ignored.
--
-- Reuses policy_configurations' default-row + per-branch-override pattern
-- (...037). Resolved by resolveEffectivePolicy in staffPicker.service.ts; read
-- by applyLateAndNoShowTransition in booking.service.ts.

alter table public.policy_configurations
  add column no_show_after_minutes integer not null default 30
    check (no_show_after_minutes >= 0),
  add column no_show_at_closing boolean not null default false;

comment on column public.policy_configurations.no_show_after_minutes is
  'Minutes after scheduled_start that a booking stays Late before becoming No-show. Ignored when no_show_at_closing is true. Resolved by resolveEffectivePolicy in staffPicker.service.ts.';

comment on column public.policy_configurations.no_show_at_closing is
  'When true, a Late booking becomes No-show at the branch''s closing time on the booking''s day (branches.operating_hours, branch timezone) instead of no_show_after_minutes after its start.';
