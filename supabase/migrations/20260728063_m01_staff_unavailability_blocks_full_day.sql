-- Days-off UI revision: "Entire day" option when a staff member requests a
-- day off (or an Admin/Supervisor/Superadmin requests one on behalf of
-- another staff member). This is purely a UI-facing distinction for how
-- start_time/end_time were computed (that date's full branch operating-hours
-- window, resolved server-side in unavailabilityBlock.service.ts) - it does
-- not add a new approval path. The existing
-- trg_enforce_unavailability_block_status trigger from migration ...019
-- already assigns status from is_quick_action/created_by-vs-staff_id alone,
-- so no trigger change is needed here.

alter table public.staff_unavailability_blocks
  add column is_full_day boolean not null default false;
