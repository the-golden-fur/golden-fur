-- Custom change (Daycare cage picker): a receptionist booking a Daycare
-- service can now name a cage preference, same as Hotel - Daycare already
-- claims a real cage at check-in (daycareCheckIn.service.ts's
-- resolveAndClaimCage), so the booking-time Cage Picker applies to it too.
--
-- 20260809113 seeded Daycare with cage_picker_enabled = false because the
-- picker was Hotel-only at the time (cagePicker.service.ts hard-returned
-- false for every other category). That gate now accepts Daycare as well,
-- so this turns the toggle on to match Hotel's seeded value. It stays an
-- ordinary admin-editable toggle (Admin Settings > Service Types).

update public.service_types
set cage_picker_enabled = true
where key = 'Daycare';

-- Custom change (Daycare overnight billing), same request: a Daycare pet
-- that isn't picked up before closing is now billed hourly only up to
-- closing time, then the branch's Hotel nightly rate per night
-- (daycareBilling.service.ts's resolveHotelNightlyRate) - not this flat
-- per-service fee on top of an hourly charge that kept running overnight.
-- The column stays, but only as the fallback for a branch with no active
-- Hotel service; no data changes.
comment on column public.services.daycare_overnight_fee is
  'Daycare-only fallback: a pet not picked up before closing is charged the branch''s Hotel nightly rate per night (daycareBilling.service.ts); this is used only when that branch has no active Hotel service. NULL falls back to the documented ₱850 default.';
