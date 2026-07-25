-- Epic A Revision Batch 1 follow-up: breeds had no CRUD anywhere - migration
-- 20260725041 only granted SELECT RLS (seed-only lookup table, "Admin/
-- Superadmin ability to add new breed rows is out of scope this issue").
-- Manual testing surfaced this as a real gap; adds INSERT/UPDATE/DELETE,
-- restricted to Admin/Superadmin, matching the maintenance (M12/M13)
-- catalog tables' two-tier read/write RLS shape.

create policy "Admins and superadmins can insert breeds"
  on public.breeds
  for insert
  to authenticated
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can update breeds"
  on public.breeds
  for update
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'))
  with check (public.current_staff_role() in ('Admin', 'Superadmin'));

create policy "Admins and superadmins can delete breeds"
  on public.breeds
  for delete
  to authenticated
  using (public.current_staff_role() in ('Admin', 'Superadmin'));
