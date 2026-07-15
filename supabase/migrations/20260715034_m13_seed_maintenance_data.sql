-- Sprint 2 Epic A (#44): seed data - base service list, Golden Package, and
-- the two government-mandated discounts (Senior Citizen, PWD).
--
-- The base service list is a placeholder drawn from Modules-Features'
-- example enumeration, pending adviser confirmation (sprint task 2-A /
-- Guide Open Items); prices are first-draft values. 'Brushing' is added
-- beyond the example list because the Golden Package is specified as
-- "Shampoo, Blow-dry, Brush" and the example list has no brush service -
-- Bath stands in for Shampoo. Promos are deliberately NOT seeded: they are
-- inherently campaign-specific and there is no default promo.
--
-- Idempotency (#44 AC-4): services use fixed deterministic ids with ON
-- CONFLICT DO NOTHING.
--
-- Scope of this migration: only branch-INDEPENDENT data (services +
-- their pricing tiers) - this is core catalog data that must exist in
-- every environment a migration reaches, including a linked remote/
-- production project via `supabase db push`.
--
-- Branch-DEPENDENT seed data (service_branch_availability, the per-branch
-- Golden Package, and the per-branch/per-category mandated discounts) is
-- deliberately NOT seeded here: a migration cannot assume branches.id
-- values exist yet (on a fresh `supabase db reset`, seeds run AFTER
-- migrations, and branches are themselves seed data from module-1). That
-- data instead lives in supabase/seeds/module-3-maintenance/ - a plain
-- .sql file (auto-run by `supabase db reset`, ordered after module-1 in
-- supabase/config.toml) and an idempotent .ts script (`npm run
-- seed:module-3`) for a linked remote database - matching the module-1/
-- module-2 convention from Issue #38 exactly, rather than a bespoke
-- migration-defined function.

-- ---------------------------------------------------------------------------
-- Services (branch-independent) - fixed ids a13*
-- ---------------------------------------------------------------------------

insert into public.services (id, category, name, base_price, duration_minutes)
values
  -- Grooming (slot-based; base_price = S/SC tier, matrix below)
  ('a1300000-0000-4000-a000-000000000001', 'Grooming', 'Bath', 300.00, null),
  ('a1300000-0000-4000-a000-000000000002', 'Grooming', 'Blow-dry', 250.00, null),
  ('a1300000-0000-4000-a000-000000000003', 'Grooming', 'Brushing', 150.00, null),
  ('a1300000-0000-4000-a000-000000000004', 'Grooming', 'Nail Trim', 150.00, null),
  ('a1300000-0000-4000-a000-000000000005', 'Grooming', 'Teeth Brushing', 150.00, null),
  ('a1300000-0000-4000-a000-000000000006', 'Grooming', 'Ear Cleaning', 150.00, null),
  ('a1300000-0000-4000-a000-000000000007', 'Grooming', 'Anal Drain', 200.00, null),
  ('a1300000-0000-4000-a000-000000000008', 'Grooming', 'Face Trim', 150.00, null),
  ('a1300000-0000-4000-a000-000000000009', 'Grooming', 'Dematting', 350.00, null),
  ('a1300000-0000-4000-a000-000000000010', 'Grooming', 'Poodle Feet', 200.00, null),
  -- Daycare (per-hour block; M06 charges P100 first hour + P50 succeeding)
  ('a1300000-0000-4000-a000-000000000011', 'Daycare', 'Daycare (per hour)', 100.00, 60),
  -- Hotel (per-night, priced by cage size)
  ('a1300000-0000-4000-a000-000000000012', 'Hotel', 'Hotel Stay - Small Cage', 500.00, 1440),
  ('a1300000-0000-4000-a000-000000000013', 'Hotel', 'Hotel Stay - Medium Cage', 650.00, 1440),
  ('a1300000-0000-4000-a000-000000000014', 'Hotel', 'Hotel Stay - Large Cage', 800.00, 1440),
  ('a1300000-0000-4000-a000-000000000015', 'Hotel', 'Hotel Stay - XL Cage', 1000.00, 1440),
  -- Veterinary (Makati-only at booking time - enforced by M03 in Epic B,
  -- not by branch availability rows; both branches stay toggled on here and
  -- Admins can disable per branch from the #45 UI)
  ('a1300000-0000-4000-a000-000000000016', 'Veterinary', 'Wellness Exam', 500.00, null),
  ('a1300000-0000-4000-a000-000000000017', 'Veterinary', 'Vaccination', 450.00, null),
  ('a1300000-0000-4000-a000-000000000018', 'Veterinary', 'Laboratory Test', 700.00, null),
  ('a1300000-0000-4000-a000-000000000019', 'Veterinary', 'Dental Cleaning', 1500.00, null),
  ('a1300000-0000-4000-a000-000000000020', 'Veterinary', 'Surgery', 3000.00, null),
  ('a1300000-0000-4000-a000-000000000021', 'Veterinary', 'Emergency Consultation', 1000.00, null)
on conflict (id) do nothing;

-- Full size x coat matrix for every Grooming service (#44 AC-1): placeholder
-- formula price = base + weight surcharge (S+0/M+100/L+200/XL+300) + coat
-- surcharge (SC+0/LC+50), pending the adviser-confirmed price list.

insert into public.service_pricing_tiers (service_id, weight_class, coat_type, price)
select
  s.id,
  w.weight_class,
  c.coat_type,
  s.base_price + w.surcharge + c.surcharge
from public.services as s
cross join (
  values ('S', 0), ('M', 100), ('L', 200), ('XL', 300)
) as w(weight_class, surcharge)
cross join (
  values ('SC', 0), ('LC', 50)
) as c(coat_type, surcharge)
where s.category = 'Grooming'
  and s.id::text like 'a1300000-%'
on conflict (service_id, weight_class, coat_type) do nothing;

-- Branch-dependent seed data (service_branch_availability, the per-branch
-- Golden Package, and the mandated Senior Citizen/PWD discounts) lives in
-- supabase/seeds/module-3-maintenance/ - see that folder's .sql and .ts
-- files.
