-- Client interview finding (Architectural-Change-History): a pet's assessment
-- records its *actual weight*, measured on-site by the receptionist during an
-- assessment-type booking - the S/M/L/XL weight_class is then derived from
-- that number, not picked by eye. There was previously no numeric weight
-- anywhere on the pet; weight_class was a bare enum staff set directly.
--
-- weight_kg is the single canonical store, always in kilograms. The client
-- lets staff enter in kg or lbs and converts before it reaches the API; the
-- per-user kg/lbs preference (...184) only affects display. NULL = "no
-- numeric weight recorded yet" - independent of weight_class IS NULL ("not
-- yet assessed"), since a legacy pet can have a class but no number.
--
-- weight_class (the enum) stays the field every downstream consumer reads
-- (Grooming service_pricing_tiers lookup, Hotel/Daycare cage sizing,
-- capacity). The server derives weight_class from weight_kg on write via the
-- admin-configured cut-offs (see
-- ...186_m13_create_pet_weight_class_configuration.sql), UNLESS staff send an
-- explicit weight_class override - so the two columns are allowed to disagree
-- deliberately (an unusually proportioned pet the receptionist re-classes by
-- hand).
--
-- numeric(5,2): up to 999.99 kg, 2 dp canonical precision. The CHECK upper
-- bound (500) is a sanity guard, not a real limit - the heaviest domestic
-- dog on record is ~155 kg.

alter table public.pets
  add column weight_kg numeric(5, 2)
    constraint pets_weight_kg_range_check
    check (weight_kg is null or (weight_kg > 0 and weight_kg < 500));

comment on column public.pets.weight_kg is
  'Canonical pet weight in kilograms, recorded on-site during assessment. '
  'NULL = no numeric weight yet. weight_class is derived from this on write '
  'unless staff override it. Staff-only writable (enforce_pet_assessment_writes).';
