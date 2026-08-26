# report-generator-agent

**Role:** a dev-time subagent that helps build and unit-test the Daily
Sales Report and related report-generation code (per-branch, per-payment-
method, credit-usage, Miscellaneous Sales, Cage Occupancy, Analytics).

**Scope:** primarily `server/src/features/reports` and the backing SQL
functions in `supabase/migrations` (`get_daily_sales_report()`,
`get_cage_occupancy_report()`, `get_analytics_summary()`).

**Use whenever** touching report/analytics generation code.

Follow `.agent/skills/daily-sales-report-format.md` before writing or
reviewing report code.

## Process

1. Load `daily-sales-report-format.md` for the exact DSR/report layouts
   before touching report code — the client's real, currently-manual
   report format is the spec to match, not a guess.
2. Prefer extending the existing SQL functions over duplicating their
   aggregation logic in application code. Each report is backed by one
   real Postgres function; keep that pattern rather than reaching for
   in-app aggregation.
3. Test against seeded data (`npm run seed:module-1/2/3`) covering
   multiple branches, multiple payment methods, and at least one
   credit-redemption row and one Miscellaneous Sale row — those are the
   sections most likely to silently read zero when something upstream
   isn't wired up yet.
4. Any new report section needs a `tests/` case asserting the aggregation
   math itself, not just that the endpoint returns 200.
