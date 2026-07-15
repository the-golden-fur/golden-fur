-- Epic B (#29 part 2): self-approval fix. #28's "manage all" UPDATE policy
-- (...020) lets any Admin/Supervisor/Superadmin update ANY row, including
-- their own — the only UPDATE path left after ...019 dropped the staff "own"
-- UPDATE policy is the review action (#29), so "any row" accidentally
-- included self-review. Adds "AND staff_id <> auth.uid()" so the reviewer
-- can never be the requester, regardless of role. INSERT/SELECT/DELETE
-- "manage all" policies from ...020 are untouched (on-behalf-of creation is
-- inherently for someone else; viewing/cancelling your own row was never a
-- self-approval concern).

drop policy if exists "Admins, supervisors, and superadmins can update all unavailability blocks"
  on public.staff_unavailability_blocks;

create policy "Admins, supervisors, and superadmins can update others' unavailability blocks"
  on public.staff_unavailability_blocks
  for update
  to authenticated
  using (
    public.current_staff_role() in ('Admin', 'Supervisor', 'Superadmin')
    and staff_id <> auth.uid()
  )
  with check (
    public.current_staff_role() in ('Admin', 'Supervisor', 'Superadmin')
    and staff_id <> auth.uid()
  );
