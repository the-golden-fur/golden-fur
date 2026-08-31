# Supabase seed maintenance

Reference for keeping `supabase/seeds/` complete and loadable as the schema
changes. Backs `.agent/agents/seed-sync-agent.md`; applies equally when you
touch a seeded table without spawning that agent.

## How seeds are structured

Seeds are grouped into `supabase/seeds/module-N-<slug>/`, numbered by
**creation order** (not the Mxx Modules-Features number). Each folder holds a
trio:

| File             | Role                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `*.seed.ts`      | Idempotent runner, invoked from `seed:all`. Per-row existence checks.                                                          |
| `*.seed.sql`     | `supabase db reset` mirror — auto-run via `config.toml` `sql_paths`. Guarded by `where not exists` / `on conflict do nothing`. |
| `*.seed.spec.ts` | Vitest over a mock Supabase client — `npm run test:seed`. Always has an "is idempotent" case.                                  |

`*.seed.ts` / `*.seed.sql` read `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
from `server/.env`. Tables with a 1:1 FK to `auth.users`
(`staff_profiles`, `customer_profiles`) can only be seeded from the `.ts`
side (via `supabase.auth.admin.createUser`), not pure SQL.

When adding a module, wire it in **two** places only:

- `package.json` `seed:all` — append `&& tsx supabase/seeds/module-N-<slug>/module-N-<slug>.seed.ts`. Do **not** add a standalone `seed:module-N` script.
- `supabase/config.toml` `sql_paths` — add the folder's `*.sql` in dependency order (anything needing branch/staff/customer ids goes after module-1/2).

No per-module VS Code task either — the only seed task is `🌱 Seed: All
Modules` (runs `seed:all`). `seed:module-1`..`4` and their `🌱 Seed:
Module N` tasks are pre-existing and left as-is; new folders don't follow
that pattern.

## Coverage map — keep this current

**Seeded (update the listed module when its columns/enums change):**

| Table(s)                                                                                                                                  | Module   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `branches`, `staff_profiles` (+ `auth.users`)                                                                                             | module-1 |
| `customer_profiles`, `pets` (+ `auth.users`)                                                                                              | module-2 |
| `service_branch_availability`, `packages`, `package_services`, `package_branch_availability`, `discounts`, `discount_branch_availability` | module-3 |
| `cages`, `product_catalog` (food/medication, customer-owned)                                                                              | module-4 |
| `promos`, `promo_branch_availability`, `vet_medication_catalog`, `vet_procedure_catalog`                                                  | module-5 |

**Seeded by a migration, not a seed script** (change the migration, not
`supabase/seeds/`): base `services` + `service_pricing_tiers` + Misc
assessment services (`20260715034`, `20260802076`, `20260803080`),
`service_types` + `service_type_branch_availability` (`20260809113`,
`20260818133`), `policy_configurations` defaults, `promo_cap_configuration`
default row, `pricing_configuration`.

**App-only — do NOT seed** (state machines + triggers must stay honest):
`bookings`, `booking_items`, `transactions`, `transaction_line_items`,
`transaction_promo_selections`, `stays` (hotel/daycare), grooming sessions,
`consultations` / consultation line items, `care_instructions`,
`care_log_entries`, `credit_balances`, `credit_transactions`,
`cancellation_logs`, `notifications`, `activity_log`, `message_threads` /
messages / drafts / attachments, `staff_unavailability_blocks`,
`pet_vaccination_records`, `pet_medical_notes`, `pet_health_conditions`.
If a demo genuinely needs one of these pre-filled, say so and get a nod
first — then seed it in its own clearly-labelled `module-N` and keep it
out of `seed:all` if it would interfere with tests.

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
