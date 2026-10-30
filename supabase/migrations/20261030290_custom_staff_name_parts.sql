-- Custom change (staff names): a staff member's single free-text
-- display_name is split into a proper legal name - first_name, middle_name
-- (optional), last_name - plus an optional nickname.
--
-- display_name STAYS: it is read by ~48 app files and several SQL functions
-- (get_staff_availability and friends) as "the name to show". It becomes
-- DERIVED by the trigger below, so none of those readers change:
--
--   display_name = nickname (trimmed, if any)
--               else first_name || ' ' || last_name
--               else the display_name already given (legacy staff created
--                    before this change, with no legal name recorded yet)
--
-- No backfill: splitting existing free-text names into first/last would guess
-- wrong ("Ma. Clara Dela Cruz"), so existing staff keep their current name
-- until an Admin records their legal name in Staff Management.
--
-- All four columns are nullable and the trigger leaves display_name alone
-- when no parts are given, so the staff seed (m01-staff-auth) needs no change.

alter table public.staff_profiles
  add column first_name text,
  add column middle_name text,
  add column last_name text,
  add column nickname text,
  -- A legal name is recorded whole (first + last) or not at all.
  add constraint staff_profiles_first_last_name_together
    check ((first_name is null) = (last_name is null));

comment on column public.staff_profiles.first_name is
  'Legal first name. Set together with last_name. display_name is derived - see staff_profiles_sync_display_name().';
comment on column public.staff_profiles.middle_name is
  'Legal middle name (optional). Not part of display_name.';
comment on column public.staff_profiles.last_name is
  'Legal last name. Set together with first_name.';
comment on column public.staff_profiles.nickname is
  'Optional name shown around the app instead of "First Last". Staff can set their own.';

create or replace function public.staff_profiles_sync_display_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.first_name := nullif(btrim(new.first_name), '');
  new.middle_name := nullif(btrim(new.middle_name), '');
  new.last_name := nullif(btrim(new.last_name), '');
  new.nickname := nullif(btrim(new.nickname), '');

  new.display_name := coalesce(
    new.nickname,
    case
      when new.first_name is not null and new.last_name is not null
        then new.first_name || ' ' || new.last_name
    end,
    new.display_name
  );

  return new;
end;
$$;

comment on function public.staff_profiles_sync_display_name() is
  'Keeps staff_profiles.display_name = nickname, else "first_name last_name", else the existing display_name (legacy rows).';

create trigger trg_staff_profiles_sync_display_name
  before insert or update on public.staff_profiles
  for each row execute function public.staff_profiles_sync_display_name();
