-- Custom change: "breed not listed" override. The breed field (BreedSelect)
-- only accepts a breeds-table match, and the old free-text pets.breed column
-- was dropped (20260725046) - so a pet whose breed isn't in the admin list
-- had no way to record it.
--
-- breed_other holds the typed-in name instead. A pet has either a breed_id
-- (picked from the list) or a breed_other (typed in), never both. Typed
-- values deliberately do NOT create breeds rows: that list is admin-managed,
-- and a customer typo shouldn't become a dropdown option for everyone.
--
-- Covered by the existing pets RLS policies - no new policy needed.

alter table public.pets
  add column breed_other text
    constraint pets_breed_other_length_check
    check (
      breed_other is null
      or char_length(btrim(breed_other)) between 1 and 80
    ),
  add constraint pets_breed_id_or_other_check
    check (breed_id is null or breed_other is null);

comment on column public.pets.breed_other is
  'Free-text breed for a breed not in the breeds table. Mutually exclusive '
  'with breed_id.';
