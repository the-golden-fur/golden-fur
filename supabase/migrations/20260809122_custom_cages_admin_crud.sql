-- Cage CRUD (Settings > Config): Admin/Superadmin can create, edit, and
-- delete specific cages, not just toggle Under Maintenance. Superadmin
-- already has an unrestricted "for all" policy (20260727050); this adds
-- the missing Admin-scoped INSERT/DELETE policies (UPDATE already exists
-- and already covers every column, not just status, so cage_label/size
-- edits need no new policy).
--
-- Deleting a cage with an active stay would orphan that stay's cage_id -
-- deleteCage() in cageStatus.service.ts blocks deleting an Occupied/
-- Reserved cage in application code; this policy only handles the "which
-- role" question, not that invariant.

create policy "Admins can create cages at their branch"
  on public.cages
  for insert
  to authenticated
  with check (
    public.current_staff_role() = 'Admin'
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );

create policy "Admins can delete cages at their branch"
  on public.cages
  for delete
  to authenticated
  using (
    public.current_staff_role() = 'Admin'
    and branch_id = (
      select sp.branch_id from public.staff_profiles sp where sp.id = auth.uid()
    )
  );
