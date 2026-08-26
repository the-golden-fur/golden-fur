# Daily Sales Report format

**Purpose:** captures the exact report layouts so generated reports match
the client's real (currently manual) paperwork without repeated
correction, and so new report work extends the existing pattern instead of
inventing a new one.

**Where this lives:** `server/src/features/reports`; backing SQL functions
in `supabase/migrations` (`get_daily_sales_report()`,
`get_cage_occupancy_report()`, `get_analytics_summary()`).

**Use whenever** implementing or reviewing report/analytics generation
code.

## Daily Sales Report (DSR)

`get_daily_sales_report(branch, date)` returns:

- A breakdown by **service category** and **payment method**.
- **Individual transaction line items.**
- A **credit-usage section** (from `credit_transactions` redemption rows)
  — reads zero until checkout's credit-redemption stub is replaced (see
  `credit-balance-ledger.md`); don't treat a zero here as a bug in the DSR
  itself.
- A **Miscellaneous Sales total** — transactions with no booking record
  (`booking_id` NULL, `transaction_type = miscellaneous_sale`), used
  mainly for credit redemption against non-inventory retail items. This is
  distinct from the *Misc* `service_category` (Initial
  Assessment/Reassessment), which does have a booking record and flows
  through the normal Payments Queue.
- Passing no `branch` returns a **Superadmin combined-branches view.**

## Cage Occupancy Report

`get_cage_occupancy_report()` — a real-time snapshot of cage status per
size tier (S/M/L/XL): Available, Occupied, Reserved, Under Maintenance,
computed straight off the `cages` table. Available to receptionists,
admins, and supervisors.

## Transaction History

A searchable, filterable log computed from a plain filtered query (no
backing SQL function needed here — don't add one unless the query genuinely
outgrows a plain filter). Staff access: Superadmin, Admin, Supervisor,
Receptionist, Cashier at `GET /reports/transaction-history`. A parallel
customer-facing "My Transactions" page
(`GET /reports/my-transaction-history`) is scoped server-side to the
calling customer.

## Analytics Dashboard (Superadmin only)

`get_analytics_summary(branch, time_filter)` returns total revenue,
booking count, cancelled count, and cancellation rate, filterable by
Today / This Week / This Month / This Year / All Time, per branch or
combined. Gated at the route layer to Superadmin — distinct from the
operational DSR ledger available to other roles.

## Status semantics for any report touching booking state

Reflect the current **5-value booking status** (Pending / In Progress /
Completed / Cancelled / No-show) plus the **independent**
`payment_stage` (Unpaid / Paid in Advance / Paid) as two separate
dimensions — never conflate them into one combined status, and never
assume a booking's status implies its payment stage (e.g. Completed +
Unpaid is a valid, real state).

## Pattern to follow for new report sections

Prefer extending or adding a real Postgres aggregation function over
duplicating aggregation logic in application code — every report here
(DSR, Cage Occupancy, Analytics) is backed by one SQL function computing
the real numbers, not by post-processing raw rows in TypeScript.
