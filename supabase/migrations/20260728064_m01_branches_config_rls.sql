-- Superadmin System Configuration: branches.operating_hours already drives
-- slot generation (availability.service.ts) and shift-end resolution
-- (unavailabilityBlock.service.ts), but no write policy has ever existed on
-- this table (migration ...002 only added a read policy) and no route
-- exposed it. Deliberately Superadmin-only (narrower than the Admin+
-- Superadmin pattern used by policy_configurations, ...037) per this
-- feature's explicit scope - branch identity/hours are system-level
-- config, not day-to-day admin work.

create policy "Superadmins can manage branches"
  on public.branches
  for update
  to authenticated
  using (public.current_staff_role() = 'Superadmin')
  with check (public.current_staff_role() = 'Superadmin');
