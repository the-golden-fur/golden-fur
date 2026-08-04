-- Superadmin System Configuration addendum: lets Superadmin add a brand new
-- branch. ...064 added the UPDATE policy for editing existing branches but
-- never an INSERT policy, and no route ever called for one until now.
-- Mirrors that same migration's role check exactly (Superadmin-only, not the
-- Admin+Superadmin pattern used elsewhere) - branch identity is still
-- system-level config, not day-to-day admin work.

create policy "Superadmins can create branches"
  on public.branches
  for insert
  to authenticated
  with check (public.current_staff_role() = 'Superadmin');
