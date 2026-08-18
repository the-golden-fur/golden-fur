-- Custom change: promo cap configuration gains a third cap_type - 'count' -
-- capping the *number* of promos that may combine on one transaction,
-- alongside the existing 'percentage'/'flat' monetary caps (#84). cap_value
-- is reused as-is (a whole number of promos rather than a currency/percent
-- amount); the column stays numeric(10,2) since Postgres enums don't carry
-- per-value type constraints - the app layer is responsible for treating a
-- 'count' cap_value as an integer.
--
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction as a statement
-- that uses the new value, but nothing else in this migration references
-- 'count', so it's safe standalone.
alter type public.cap_type_enum add value 'count';

comment on column public.promo_cap_configuration.cap_type is
  'percentage/flat cap the combined discount amount; count caps the number '
  'of promos that may combine on one transaction (cap_value is then a whole '
  'number of promos, largest-value promos applied first).';
