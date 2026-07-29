-- Lets a staff member optionally name which Supervisor/Admin/Superadmin they
-- addressed a day-off request to. Purely informational/non-binding: the
-- review flow stays "any Admin/Supervisor/Superadmin at the branch may act
-- on a pending request" (see ...019/...020/...021's self-review design) --
-- this column does not restrict who can approve/deny, it just lets the
-- approval queue show "Requested for: <name>" alongside each pending row.
alter table public.staff_unavailability_blocks
  add column requested_reviewer_id uuid references public.staff_profiles(id);
