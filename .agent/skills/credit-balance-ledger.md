# Credit balance ledger

**Purpose:** documents the rules for the Customer Credit Balance module —
subtle rules (branch-locking, no cross-branch transfer, atomic issuance)
that are easy to implement wrong without a written reference to check
against.

**Where this lives:** `server/src/features/credits`;
`server/src/features/billing` (consumer side, currently stubbed — see
below).

**Use whenever** touching credit issuance, redemption, expiry, or the
checkout credit-application flow.

## What generates a credit

A qualifying **cancelled booking** whose item required a downpayment
converts that downpayment into credit — but only if the configured notice
period was met (see the cancellation/reschedule policy engine). If the
notice period wasn't met, the downpayment is forfeited without credit
issuance. A cancellation log is written either way.

## Credit rules

- **Branch-specific** — a customer's balance is tracked per branch
  (unique per customer + branch).
- **Non-transferable** between branches.
- **Non-refundable as cash.**
- **Expires** — 30 days from issuance by default, configurable per policy,
  toggleable on/off.

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
fallback. It writes an offsetting expiry transaction and decrements the
balance for anything past its expiry date. Any new credit-related feature
needs to account for this sweep running independently of user action.

## The known gap — checkout redemption is a stub

Credit issuance, balance tracking, and expiry are fully live end-to-end.
**Applying a credit to reduce a transaction total at checkout is not
wired up** — the billing side currently reads the balance through a stub.
This means:

- Daily Sales Report credit-usage figures read zero until this ships (see
  `daily-sales-report-format.md`).
- If your task is to wire up redemption: the intended design is atomic
  deduction with partial application, capped at the lesser of balance or
  transaction total — implement it as an extension of the same
  transactional pattern issuance uses, not a new one-off.
- Don't assume redemption already works when testing or reviewing
  checkout code that touches credits — verify against current behavior,
  not the design intent.
