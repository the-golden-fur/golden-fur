-- Enables the previous migration's captures_pet_assessment flag on the two
-- seeded services it was built for - same fixed ids
-- ...080_m13_move_assessment_services_to_misc.sql already uses for these
-- two rows.

update public.services
set captures_pet_assessment = true
where id in (
  'a1300000-0000-4000-a000-000000000022', -- Initial Assessment
  'a1300000-0000-4000-a000-000000000023'  -- Reassessment
);
