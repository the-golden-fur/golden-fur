-- Staff-role multi-select on Service Types, 3/3.
--
-- WHY: policy_configurations.staff_picker_enabled_grooming/_veterinary
-- (20260718037) duplicated service_types.staff_picker_enabled for exactly
-- two categories, and until this change was actually the ONLY one of the
-- two ever consulted by isStaffPickerEnabled() - service_types'
-- staff_picker_enabled sat unread. Now that service_types is the real,
-- admin-editable source of truth for every category (including its new
-- eligible_staff_roles column, 20260904168), this pair of booleans is dead
-- weight - one config surface (Admin Settings > Service Types) beats two
-- disagreeing ones (Admin Settings > Policies vs. Service Types).

alter table public.policy_configurations
  drop column staff_picker_enabled_grooming,
  drop column staff_picker_enabled_veterinary;
