-- Sprint 5 Epic B (#88): ALTER policy_configurations - downpayment %,
-- reschedule fee, credit expiry columns.
--
-- Numbering note: the Sprint5-EpicB-Guide assumed the latest merged
-- migration was ...092 and numbered this epic's migrations starting at 093.
-- The actual latest on dev is 20260804093 (m01_staff_unavailability_blocks_
-- leave_type), so this epic's 6 migrations are renumbered 094-099.
--
-- This is an ALTER, not a CREATE - policy_configurations already exists
-- (20260718037_m03_policy_configurations_stub.sql, Sprint 2 #52) and was
-- already extended once (20260804091, lunch break). Its existing columns,
-- unique indexes, RLS policies, and the enforcement_mode enum are untouched.
--
-- reschedule_fee_type is the only genuinely new enum this epic introduces -
-- enforcement_mode already exists and is reused as-is by cancellation_logs
-- below (095).

create type public.reschedule_fee_type as enum ('Flat', 'Percentage');

alter table public.policy_configurations
  add column downpayment_percentage numeric(5, 2) not null default 50.00
    check (downpayment_percentage >= 0 and downpayment_percentage <= 100),
  add column reschedule_fee_enabled boolean not null default false,
  -- Nullable: populated only when reschedule_fee_enabled = true.
  add column reschedule_fee_type public.reschedule_fee_type,
  add column reschedule_fee_value numeric(10, 2)
    check (reschedule_fee_value is null or reschedule_fee_value >= 0),
  -- NULL = unlimited free reschedules (documented default); 1 or 2 tightens
  -- it. Read against the existing bookings.reschedule_count column.
  add column reschedule_free_allowance integer
    check (reschedule_free_allowance is null or reschedule_free_allowance >= 0),
  add column credit_expiry_enabled boolean not null default true,
  add column credit_expiry_days integer not null default 30
    check (credit_expiry_days > 0);
