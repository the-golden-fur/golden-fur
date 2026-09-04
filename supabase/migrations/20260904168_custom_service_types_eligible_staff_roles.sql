-- Custom change: Staff Picker role eligibility becomes per-service-type
-- configurable (admin backlog: "staff picker doesn't specify what roles").
-- Adds an array column alongside the existing staff_picker_enabled toggle -
-- WHICH roles are eligible, on top of WHETHER the picker is offered at all.
-- Precedent for a Postgres array-of-enum column in this schema:
-- p_branch_ids uuid[] (20260902159_m10_policy_credit_expiry_mode.sql).
--
-- Backfills the 4 seeded rows to match today's hardcoded
-- CATEGORY_STAFF_ROLE map in staffPicker.service.ts/availability.service.ts
-- (Grooming -> Groomer, Veterinary -> Veterinarian) so existing behavior is
-- unchanged until an admin edits a row. Hotel/Daycare stay {} - staff picker
-- is off for both today; an admin fills roles in via the new admin-page
-- multi-select if either is ever turned on.
--
-- Companion migrations: 20260904169 makes get_staff_availability() accept
-- multiple roles; 20260904170 drops the now-redundant
-- policy_configurations.staff_picker_enabled_grooming/_veterinary columns,
-- since service_types.staff_picker_enabled becomes the one live gate for
-- every category (previously it sat unused - only the policy toggle was
-- actually consulted).

alter table public.service_types
  add column eligible_staff_roles public.staff_role[] not null default '{}';

update public.service_types set eligible_staff_roles = '{Groomer}' where key = 'Grooming';
update public.service_types set eligible_staff_roles = '{Veterinarian}' where key = 'Veterinary';
