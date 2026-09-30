-- Auto Build Monthly Schedule: nothing today distinguishes a Rest Day row
-- an admin/supervisor created via the bulk Auto Build flow from one they
-- (or a previous Auto Build run) added by hand through the existing
-- one-at-a-time flow. "Clear Monthly Schedule" needs to delete only the
-- former, never a staff member's own requested leave or a manually-added
-- Rest Day - see unavailabilityBlock.service.ts's commitAutoBuildSchedule/
-- clearAutoBuildSchedule.
alter table public.staff_unavailability_blocks
  add column created_by_auto_build boolean not null default false;
