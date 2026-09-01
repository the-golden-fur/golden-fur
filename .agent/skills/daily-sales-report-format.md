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

`get_daily_sales_report(branch, date)` returns (since migration
20260901157, every `transactions` aggregation below counts **only settled
`payment_status = 'Fully Paid'` rows** — a booking_payment row is created
`'Pending'` up front and would otherwise inflate gross by every
uncollected charge):

- A breakdown by **service category** and **payment method**, plus totals.
  No individual transaction line-item array — the `DailySalesReport` TS
  type has no such field; that granularity lives only in the separate
  Transaction History report below.
- A **credit-usage section** (from `credit_transactions` redemption rows,
  not filtered by `payment_status`) — live now that credit redemption is
  wired (see `credit-balance-ledger.md`).
- A **Miscellaneous Sales total** — transactions with no booking record
  (`booking_id` NULL, `transaction_type = miscellaneous_sale`), used
  mainly for credit redemption against non-inventory retail items. This is
  distinct from the _Misc_ `service_category` (Initial
  Assessment/Reassessment), which does have a booking record and is
  settled per-transaction on the Transactions page like any other booking
  payment.
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
combined. Total revenue counts only settled
(`payment_status = 'Fully Paid'`) transactions (migration 20260901157). Gated at the route layer to Superadmin — distinct from the
operational DSR ledger available to other roles.

## Status semantics for any report touching booking state

Reflect the current **5-value booking status** (Pending / In Progress /
Completed / Cancelled / No-show) plus the **independent**
`payment_status` (Pending / Partially Paid / Fully Paid — a stored rollup
of the booking's settled `booking_payment` transactions) as two separate
dimensions — never conflate them into one combined status, and never
assume a booking's status implies its payment status (e.g. Completed +
Pending is a valid, real state).

## Pattern to follow for new report sections

Prefer extending or adding a real Postgres aggregation function over
duplicating aggregation logic in application code — every report here
(DSR, Cage Occupancy, Analytics) is backed by one SQL function computing
the real numbers, not by post-processing raw rows in TypeScript.
