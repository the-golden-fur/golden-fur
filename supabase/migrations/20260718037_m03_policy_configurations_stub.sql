-- Sprint 2 Epic B (#52): policy_configurations STUB + enforcement_mode enum.
--
-- STUB scope (Guide -> Epic Overview -> Out of Scope): only the columns this
-- epic's flows actually read are created - notice period / enforcement mode /
-- enforcement toggle (read by #54) and the two Staff Picker visibility
-- toggles (read by #52's staffPicker.service.ts). Downpayment %, reschedule
-- fee, and credit expiry columns are NOT created here; Sprint 5's full M09
-- epic will ALTER TABLE onto this same table (do not re-create it).
--
-- enforcement_mode is created here because the stub needs it now; full M09
-- (Sprint 5) reuses this same enum rather than redeclaring.

create type public.enforcement_mode as enum ('Strict', 'Soft');

create table public.policy_configurations (
  id uuid primary key default gen_random_uuid(),
  -- NULL = the system-wide default row; a branch-specific row overrides it.
  branch_id uuid references public.branches(id),
  -- Minimum notice for a reschedule/cancellation to qualify - matches the
  -- Modules-Features default of 3 days.
  notice_period_days integer not null default 3
    check (notice_period_days >= 0),
  -- Strict blocks the action outright; Soft allows it but flags
  -- policy_violation: true in the API response (no cancellation_logs table
  -- exists yet to persist the flag - Sprint 5).
  notice_enforcement_mode public.enforcement_mode not null default 'Strict',
  -- Master toggle; when false, the notice-period check is skipped entirely
  -- regardless of mode.
  notice_enforcement_enabled boolean not null default true,
  staff_picker_enabled_grooming boolean not null default true,
  staff_picker_enabled_veterinary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per branch, and exactly one system-wide default row.
create unique index policy_configurations_branch_uniq
  on public.policy_configurations(branch_id)
  where branch_id is not null;

create unique index policy_configurations_default_uniq
  on public.policy_configurations((true))
  where branch_id is null;

-- Seed the system-wide default row with every setting at its documented
-- default (3 days, Strict, enforcement on, both Staff Picker toggles on).
insert into public.policy_configurations (branch_id) values (null);

-- RLS: all authenticated staff (and the server-side booking flow, which uses
-- the service-role client) can read; only Admin/Superadmin can write (#52
-- AC-5). Customers never read this table directly - the booking flow resolves
-- Staff Picker visibility server-side.

alter table public.policy_configurations enable row level security;

create policy "Staff can read policy configurations"
  on public.policy_configurations
  for select
  to authenticated
  using (public.current_staff_role() is not null);

create policy "Admins and superadmins can manage policy configurations"
  on public.policy_configurations
  for all
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));
