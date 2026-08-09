-- Boarding Checklist Kanban view: a Pending/In Progress/Completed status
-- per task, not just the existing binary completed_at. completed_at/
-- completed_by remain exactly as before (still forced server-side, only
-- ever set when status transitions to 'Completed') - this adds the
-- intermediate 'In Progress' state Kanban's most important group-by needs.

alter table public.care_log_entries
  add column status text not null default 'Pending'
    check (status in ('Pending', 'In Progress', 'Completed'));

update public.care_log_entries
set status = 'Completed'
where completed_at is not null;
