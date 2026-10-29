-- Custom change (Day Off Requests queue): a staff member's own "Take the
-- rest of today off" quick action used to auto-approve (migration ...019's
-- `is_quick_action -> 'approved'` branch), skipping the approver entirely.
-- Every self-made request now goes through review like a custom range does;
-- only a Supervisor/Admin/Superadmin acting on another staff member's behalf
-- (created_by <> staff_id) still auto-approves. is_quick_action itself is
-- kept - it still marks how the window was resolved.

create or replace function public.enforce_unavailability_block_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by <> new.staff_id then
    -- Admin/Supervisor/Superadmin acting on behalf of another staff member
    new.status := 'approved';
  else
    -- staff member requesting time off for themselves, quick action or not
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.denial_reason := null;
  end if;

  return new;
end;
$$;
