# Credit balance ledger

**Purpose:** documents the rules for the Customer Credit Balance module —
subtle rules (branch-locking, no cross-branch transfer, atomic issuance)
that are easy to implement wrong without a written reference to check
against.

**Where this lives:** `server/src/features/credits`;
`server/src/features/billing` (consumer side — `creditStub.service.ts`,
`transactionPayment.service.ts`; redemption is live, see below).

**Use whenever** touching credit issuance, redemption, expiry, or the
checkout credit-application flow.

## What generates a credit

A qualifying **cancelled booking** converts a share of what the customer
**actually paid** into credit — but only if the configured notice period
was met (see the cancellation/reschedule policy engine). If the notice
period wasn't met, the payment is forfeited without credit issuance. A
cancellation log is written either way.

- **Amount paid** is the sum of the booking's `booking_payment`
  `transactions` rows that a cashier or the PayMongo webhook has settled —
  every settled row is `payment_status = 'Fully Paid'`, an uncollected
  charge stays `'Pending'` — read in `cancellation.service.ts` via
  `confirmedAmountPaid()`. **Not** `bookings.payment_status` (the
  Pending / Partially Paid / Fully Paid rollup): the rollup answers "is this
  booking square?", not "how much cash came in" — always sum the settled
  `transactions` rows for credit math. A booking with no settled transaction
  converts nothing.
- **Conversion rate** is `policy_configurations.cancellation_credit_conversion_rate`
  — a branch-scoped percentage (`0`–`100`, `NOT NULL DEFAULT 100`), resolved
  by `resolveEffectivePolicy()` like every other policy field, editable on
  Settings → Config → Policies. `creditAmount = round2(amountPaid × rate / 100)`.
- Credit issuance is **not** gated on the `cancellation_logs` write
  succeeding (issue #117): `credit_transactions.cancellation_log_id` is
  nullable, so a failed log write still issues the credit (with a null link).

## Credit rules

- **Branch-specific** — a customer's balance is tracked per branch
  (unique per customer + branch).
- **Non-transferable** between branches.
- **Non-refundable as cash.**
- **Expires** — per the branch's `policy_configurations.credit_expiry_mode`
  (migration `20260902159`), one of: `none` (never), `rolling`
  (`credit_expiry_days` after issuance — default 30), or `fixed_date` (every
  lot at the branch on `credit_expiry_fixed_date`). Mutually exclusive;
  replaced the old `credit_expiry_enabled` boolean. Changing the mode is
  **retroactive** — when the effective mode/days/date for a branch actually
  changes, `updatePolicyConfiguration()` calls the
  `reapply_branch_credit_expiry()` RPC to re-stamp `expires_at` on every
  not-yet-swept issuance row at the affected branch(es) (the one branch for
  an override row; every override-less branch for the default row). It's
  best-effort — a failure is logged and the policy save still returns 200, so
  the retroactive re-stamp is not guaranteed on an RPC error.
- **Expiry lands on a day boundary** — every lot's `expires_at` is the **end
  of its Asia/Manila calendar day** (migration `20260902160`;
  `server/src/features/credits/modules/creditExpiry.util.ts` for new lots,
  `reapply_branch_credit_expiry()` for retroactive ones). So credit "expires
  Oct 1", not "Oct 1 at 05:28", and two lots issued hours apart the same day
  expire together. The client mirrors this: `credits/utils/expiry.ts` buckets
  the schedule by Manila day and counts down in whole Manila calendar days.

## Atomic issuance

Issuance must happen as a single database transaction: upsert the
customer's balance **and** insert a signed `credit_transactions` row
(issuance positive, redemption/expiry negative) together, not as two
separate application-level writes that could partially fail. Mirror the
existing `issue_credit()` DB-function pattern rather than doing this
balance math in application code across multiple round-trips.

## Expiry sweep

Handled by an `expire_credits()` function — run on a schedule (`pg_cron`
where available) or via an Admin/Superadmin-triggerable endpoint as a
fallback. It walks not-yet-swept issuance rows oldest-expiry-first,
re-reading the balance each iteration (migration `20260902159` — the
original selected it once, which could drive the balance negative when
several same-dated `fixed_date` lots exceeded it), writes an offsetting
expiry transaction, and decrements the balance for anything past its expiry
date. Any new credit-related feature needs to account for this sweep running
independently of user action.

## Surfacing expiry to customers

`GET /credits/balances` enriches each per-branch row with `next_expires_at`
and `next_expires_amount` (the soonest **Manila day**'s lot total,
FIFO-capped at the balance) so the navbar pill's hover popover needs no
history fetch. The `/portal/credits` page (`CustomerCreditsPage`) pulls
per-branch history and replays the same FIFO walk client-side
(`credits/utils/expiry.ts` `computeExpirySchedule`) for the full schedule;
`schedule[0]` must equal the server's `next_expires_*`.

**Redemptions are not lot-attributed.** `redeem_credit()` decrements the
balance number only; `expire_credits()` expires oldest-expiry-first up to
whatever balance remains. So a redemption effectively comes out of the
customer's _latest_-expiring credit, and the schedule can legitimately show
₱0 on a later date whose lot exists in the raw ledger — it reflects what the
sweep will actually do.

## Checkout redemption is now wired

Credit issuance, balance tracking, expiry, **and** redemption are all live
end-to-end since the payment/transactions rework:

- `creditStub.service.ts` (filename kept so callers' import paths don't
  change) wraps the atomic `redeem_credit()` RPC (migration 20260901155) —
  upsert-decrement the balance and insert a signed redemption row in one
  DB transaction.
- `checkoutAggregation.service.ts` and `miscSale.service.ts` apply credit
  partially via `applyCredit()`, capped at the lesser of balance or
  transaction total.
- `payTransactionWithCredit` in
  `server/src/features/billing/services/transactionPayment.service.ts`
  pays a whole Pending transaction from the customer's branch-locked
  balance — **full-cover only** this round; a charge the balance can't
  cover has to be split first. It settles the transaction as payment
  method `'Credit'` and stamps `credit_applied_amount`.
- Daily Sales Report credit-usage figures now read real redemption rows
  (see `daily-sales-report-format.md`).
