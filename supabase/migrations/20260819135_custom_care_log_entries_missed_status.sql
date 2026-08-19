-- Boarding Checklist Kanban redesign: adds a 4th status, 'Missed', alongside
-- the existing Pending/In Progress/Completed (migration 20260809121).
-- Missed is a lazy, read-time transition (no cron infra exists in this app,
-- same as bookings.status='No-show') - applied server-side whenever a
-- Pending/In Progress entry's scheduled_date is found to be in the past,
-- not written directly by any client request.

alter table public.care_log_entries
  drop constraint care_log_entries_status_check,
  add constraint care_log_entries_status_check
  check (status in ('Pending', 'In Progress', 'Completed', 'Missed'));
