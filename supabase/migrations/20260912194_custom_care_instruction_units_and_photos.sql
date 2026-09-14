-- Custom change: feeding/medication care instructions get a structured unit
-- of measurement (quantity_unit/dose_unit) instead of relying on freetext
-- quantity/dose strings to carry a unit (e.g. "1 cup", "250mg"), plus an
-- optional photo_url so a customer can attach a picture of the food/
-- medication item when adding it (diet-app style specificity). Both columns
-- are nullable/no default - existing rows predate this feature and a walk-in
-- row added directly at check-in has no unit-picker UI of its own; display
-- code treats a null unit as "no unit recorded" rather than backfilling a
-- guess.
alter table public.care_feeding_instructions
  add column quantity_unit text
    check (
      quantity_unit is null or quantity_unit in (
        'cup', 'gram', 'ounce', 'can', 'scoop', 'tablespoon', 'teaspoon',
        'milliliter', 'piece'
      )
    ),
  add column photo_url text;

alter table public.care_medication_instructions
  add column dose_unit text
    check (
      dose_unit is null or dose_unit in (
        'mg', 'ml', 'tablet', 'capsule', 'drop', 'application'
      )
    ),
  add column photo_url text;
