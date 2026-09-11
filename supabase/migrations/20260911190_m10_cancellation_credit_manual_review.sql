-- Custom change (manual-cancellation-credit-review): today, a qualifying
-- cancellation (notice met, something was paid) always converts straight to
-- account credit automatically (cancellation.service.ts). Lets a branch
-- instead require a staff member to manually read the cancellation reason
-- and decide whether the downpayment is credited - the whole point being
-- human judgment on the reason's validity, not another date/time rule, so
-- Manual mode ignores the notice-period outcome entirely: ANY cancellation
-- with a confirmed payment goes to review, not just the ones that would
-- already fail the notice check.
--
-- Same default-row + per-branch-override + resolveEffectivePolicy() shape as
-- every other policy_configurations column (mirrors notice_enforcement_mode's
-- own boolean-adjacent-enum pairing). NOT NULL DEFAULT 'Automatic' keeps
-- today's behaviour unchanged until a branch opts into Manual.

create type public.credit_review_mode as enum ('Automatic', 'Manual');

alter table public.policy_configurations
  add column credit_review_mode public.credit_review_mode not null default 'Automatic';

comment on column public.policy_configurations.credit_review_mode is
  'Automatic (default): a qualifying cancellation (notice met, something paid) converts to account credit immediately, per cancellation_credit_conversion_rate. Manual: every cancellation with a confirmed payment is instead queued on cancellation_logs (credit_review_status = ''pending'') for a staff member to approve/deny after reading the cancellation reason - the notice-period outcome is not consulted in this mode.';

-- cancellation_logs: a fourth state alongside the existing binary
-- credit_issued - 'pending' rows are never auto-issued (credit_issued stays
-- false, credit_amount stays null, satisfying the existing
-- cancellation_logs_credit_amount_requires_issued check unchanged) until a
-- staff member decides via the new review endpoint, which then either calls
-- the same issue_credit() RPC cancellation.service.ts already uses (status
-- -> 'approved', credit_issued -> true) or leaves the payment forfeited
-- (status -> 'denied', credit_issued stays false). Every pre-existing row
-- (and every reschedule-event row, which never goes through credit review at
-- all) backfills to 'not_applicable'.
create type public.credit_review_status as enum (
  'not_applicable',
  'pending',
  'approved',
  'denied'
);

alter table public.cancellation_logs
  add column credit_review_status public.credit_review_status not null default 'not_applicable',
  add column reviewed_by uuid references public.staff_profiles(id),
  add column reviewed_at timestamptz;

comment on column public.cancellation_logs.credit_review_status is
  'not_applicable (default): Automatic mode, or nothing was paid. pending: Manual mode, awaiting a staff decision. approved/denied: the outcome, once a staff member (reviewed_by/reviewed_at) has decided.';
