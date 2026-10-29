# Supabase seed maintenance

Reference for keeping `supabase/seeds/` complete and loadable as the schema
changes. Backs `.agent/agents/seed-sync-agent.md`; applies equally when you
touch a seeded table without spawning that agent.

## How seeds are structured

Seeds are grouped into `supabase/seeds/mNN-<slug>/`, named for the
**Modules-Features module number** (M01-M14) they seed. Only modules that
have reference/lookup data get a folder — most modules are transactional and
seed nothing. Each folder holds a trio:

| File             | Role                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `*.seed.ts`      | Idempotent runner, invoked from `seed:all`. Per-row existence checks.                                                          |
| `*.seed.sql`     | `supabase db reset` mirror — auto-run via `config.toml` `sql_paths`. Guarded by `where not exists` / `on conflict do nothing`. |
| `*.seed.spec.ts` | Vitest over a mock Supabase client — `npm run test:seed`. Always has an "is idempotent" case.                                  |

`*.seed.ts` / `*.seed.sql` read `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
from `server/.env`. Tables with a 1:1 FK to `auth.users`
(`staff_profiles`, `customer_profiles`) can only be seeded from the `.ts`
side (via `supabase.auth.admin.createUser`), not pure SQL.

When adding a module folder, wire it in **two** places only:

- `package.json` `seed:all` — append `&& tsx supabase/seeds/mNN-<slug>/mNN-<slug>.seed.ts` in module-number order. There are **no** standalone `seed:mNN` scripts.
- `supabase/config.toml` `sql_paths` — add the folder's `*.sql` after `m01` (everything needs branches/staff); order among the rest doesn't matter functionally.

The seed VS Code tasks are `🌱 Seed: All Modules` (runs `seed:all` against
`server/.env`) and `🌱 Seed: All Modules (Linked Project)` (runs
`seed:all:linked` → `scripts/seed-linked.mjs`, which points `seed:all` at the
`supabase link`ed project) — no per-module tasks.

Two more entry points reuse the same module scripts (both also have a
`:linked` variant, run by their VS Code task through `scripts/seed-linked.mjs <script>`):

- `seed:prod` (task `🏭 Seed: Production Reference Data (Linked Project)`) —
  reference data only: m01 with `--branches-only`, then m05, m07, m12, m13,
  custom-rewards. **No m02 and no staff** — production staff and customer
  accounts are created by hand. Rows that need an owner (m05's
  customer-owned food/medication catalog, m07's vet templates) skip
  themselves until one exists; re-run after adding a Veterinarian to fill
  them in. A new reference module goes here too, unless it needs seeded
  accounts.
- `seed:sample-data` (task `🎬 Seed: Sample Data (Linked Project)`) — runs
  `seed:all`, then `temp-demo/temp-demo.seed.ts`, which fills every
  app-only table below with demo rows (plus about six months of backdated
  paid history for the Reports charts). For demos and videos only — never
  production.

## Coverage map — keep this current

**Seeded (update the listed folder when its columns/enums change):**

| Table(s)                                                                                                                                                        | Folder               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `branches`, `staff_profiles` (+ `auth.users`)                                                                                                                   | `m01-staff-auth`     |
| `customer_profiles`, `pets` (+ `auth.users`)                                                                                                                    | `m02-customers-pets` |
| `cages`, `product_catalog` (food/medication, customer-owned)                                                                                                    | `m05-hotel`          |
| `vet_medication_catalog`, `vet_prescription_templates`, `vet_consultation_form_templates` (replaces the dropped `vet_procedure_catalog`), `vet_service_catalog` | `m07-veterinary`     |
| `discounts`, `discount_branch_availability` (Senior Citizen / PWD)                                                                                              | `m12-discounts`      |
| `service_branch_availability`, `packages`, `package_services`, `package_branch_availability`, `promos`, `promo_branch_availability`                             | `m13-maintenance`    |

**Seeded by a migration, not a seed script** (change the migration, not
`supabase/seeds/`): base `services` + `service_pricing_tiers` + Assessment
(renamed from Misc) assessment services (`20260715034`, `20260802076`,
`20260803080`, `20260903167`),
`service_types` + `service_type_branch_availability` (`20260809113`,
`20260818133`), `policy_configurations` defaults, `promo_cap_configuration`
default row, `pricing_configuration`, `landing_content` + `landing_sections` +
`landing_reviews` (the editable landing page, `20261017272`),
`feature_flags` (Settings > Experimental switches, `20261025281` - one row
per flag, `spin_wheel` off by default).

**App-only — do NOT seed** (state machines + triggers must stay honest):
`bookings`, `booking_items`, `transactions`, `transaction_line_items`,
`transaction_promo_selections`, `stays` (hotel/daycare), grooming sessions,
`consultations` / consultation line items, `care_instructions`,
`care_log_entries`, `credit_balances`, `credit_transactions`,
`cancellation_logs`, `notifications`, `activity_log`, `message_threads` /
messages / drafts / attachments, `staff_unavailability_blocks`,
`pet_vaccination_records`, `pet_medical_notes`, `pet_health_conditions`,
`service_pricing_cell_overrides` / `package_pricing_cell_overrides` (a
Superadmin's own weight x coat prices; no rows = every cell follows the
`pricing_configuration` formula), `goal_growth_rates` /
`goal_monthly_targets` (a Superadmin's own goal settings; no rows = every
goal is the previous month + 10%).
If a demo genuinely needs one of these pre-filled, say so and get a nod
first. Demo rows for these tables live in `temp-demo/` (run by
`seed:sample-data`, never `seed:all` or `seed:prod`). A new app table should
get its demo rows there. The exceptions are MFA/device tables,
`deleted_records_archive`, the pricing cell overrides and goal settings:
leave those empty.

## Change checklist

- Column added to a seeded table → add it to the `.ts` insert, the `.sql`
  insert, and the spec's mock row shape + assertions.
- Column made NOT NULL / given a new CHECK → make sure every seeded row
  supplies a valid value.
- Enum value renamed/removed → grep `supabase/seeds/` for the old literal.
- Table renamed → rename in all three files + this map.
- FK target table gains rows the seed should reference → resolve by lookup,
  not a hardcoded id.
- New reference/lookup/config table → seed it (extend nearest module).
