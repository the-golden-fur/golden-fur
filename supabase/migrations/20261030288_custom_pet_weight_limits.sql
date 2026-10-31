-- Custom change (pet weight limits): the lightest and heaviest weight staff
-- may record for a pet. Before this, any number above 0 was accepted (a
-- 1500-for-15.00 typo became a real weight, and with it a weight class,
-- Grooming price and cage size), with only a loose 499 kg cap in the API.
--
-- Columns on the existing pet_weight_class_configuration singleton (...186)
-- rather than a new table: every staff weight-entry screen and the server's
-- weight-class derivation already read that row, so the limits travel with
-- it. Superadmin-edited on the Weight Classes config page.
--
-- Defaults: 0.10 kg (a newborn kitten/puppy) to 156 kg (the heaviest dog on
-- record, ~155.6 kg). The limits must sit outside the S/M/L/XL cut-offs so no
-- class becomes unreachable, and never above the API's 499 kg ceiling.

alter table public.pet_weight_class_configuration
  add column min_weight_kg numeric(5, 2) not null default 0.10,
  add column max_weight_kg numeric(5, 2) not null default 156.00;

alter table public.pet_weight_class_configuration
  add constraint pet_weight_class_configuration_weight_limits_check
    check (
      min_weight_kg > 0
      and min_weight_kg < m_min_kg
      and xl_min_kg < max_weight_kg
      and max_weight_kg <= 499
    );

comment on column public.pet_weight_class_configuration.min_weight_kg is
  'Lightest weight (kg) staff may record for a pet. Must be below m_min_kg.';
comment on column public.pet_weight_class_configuration.max_weight_kg is
  'Heaviest weight (kg) staff may record for a pet. Must be above xl_min_kg, at most 499.';
