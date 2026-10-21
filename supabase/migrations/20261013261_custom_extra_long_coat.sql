-- Custom change (Extra Long Coat): a third coat type beside Short Coat (SC)
-- and Long Coat (LC) - XLC. Like the other two it is recorded by staff at
-- assessment (pets.coat_type) and it prices Grooming: the size x coat grid
-- grows from 4 x 2 = 8 cells to 4 x 3 = 12.
--
-- Extra Long Coat gets its OWN rule in pricing_configuration, a sixth beside
-- the four size rules and coat_long - it replaces the Long Coat rule for an
-- XLC pet, it does not stack on top of it. It starts as a copy of whatever
-- the Long Coat rule is right now, so an XLC pet is never charged less than
-- an LC one on day one; a Superadmin then sets it apart in Pricing
-- Configuration.
--
-- No existing pet changes: nobody is Extra Long Coat until staff record it.
-- No new table, so no new RLS policy or archive trigger.

-- Safe inside this migration's transaction: the new enum value is only added
-- here, never used (the CHECKs below are on text columns).
alter type public.pet_coat_type add value if not exists 'XLC';

-- The per-cell price overrides (20261008256) key on coat_type as text with a
-- CHECK, not the enum - widen both.
alter table public.service_pricing_cell_overrides
  drop constraint if exists service_pricing_cell_overrides_coat_type_check,
  add constraint service_pricing_cell_overrides_coat_type_check
    check (coat_type in ('SC', 'LC', 'XLC'));

alter table public.package_pricing_cell_overrides
  drop constraint if exists package_pricing_cell_overrides_coat_type_check,
  add constraint package_pricing_cell_overrides_coat_type_check
    check (coat_type in ('SC', 'LC', 'XLC'));

alter table public.pricing_configuration
  add column coat_extra_long_rule_type public.pricing_rule_type
    not null default 'flat',
  add column coat_extra_long_rule_value numeric(10, 2)
    not null default 0.00
    constraint pricing_configuration_coat_extra_long_rule_value_check
      check (coat_extra_long_rule_value >= 0);

-- Start it equal to the Long Coat rule (the defaults above only cover a
-- pricing_configuration row created after this migration).
update public.pricing_configuration
set coat_extra_long_rule_type = coat_long_rule_type,
    coat_extra_long_rule_value = coat_long_rule_value;

comment on table public.pricing_configuration is
  'Singleton (Admin/Superadmin editable): the shared grooming size/coat '
  'calculation - six independent rules (size_s/m/l/xl, coat_long, '
  'coat_extra_long), each a type (multiplier/flat/percentage) + value. '
  'Percentage rules are always a percentage of the service''s own '
  'base_price. A coat rule applies on top of the size-adjusted price; Extra '
  'Long Coat uses its own rule in place of the Long Coat one.';
