# PayMongo webhook handling

**Purpose:** reference for implementing or reviewing the PayMongo (GCash/
Maya) integration — webhook signature verification, idempotent status
updates, and testing against the sandbox — so this isn't re-derived from
scratch each session. Payment code must be correct on the first real
deploy.

**Where this lives:** `server/src/features/billing/services/paymongo.service.ts`,
`webhookConfirmation.service.ts`, `routes/paymongoWebhook.routes.ts`,
`checkoutAggregation.service.ts`, `transactionPayment.service.ts`.

**Use whenever** implementing or reviewing PayMongo webhook, checkout, or
online-payment code.

## Signature verification

Every inbound webhook must be verified before its payload is trusted —
PayMongo signs webhook events. Reject (don't process) anything that fails
verification; treat an unverified webhook as attacker-controlled input, not
just malformed data.

## Idempotency

PayMongo can and will redeliver the same event. Before applying a status
change:

1. Check whether this event (or the resulting state change) has already
   been applied — don't settle a transaction, recompute
   `bookings.payment_status`, or move a credit balance twice for one
   logical payment.
2. Prefer a database-level uniqueness/idempotency guard over an
   application-level "have I seen this before" check that can race under
   concurrent delivery.

## Who initiated the payment matters

`transactions.initiated_by` (`staff` / `customer`) and
`transactions.payment_choice` (`full` / `downpayment` / `balance`, carried
on staff-created rows too since the payment/transactions rework)
distinguish two payment paths:

- **Customer self-service** (portal "My Bookings > Pay"): webhook
  confirmation settles the transaction and calls
  `recomputeBookingPaymentStatus(bookingId)` to refresh the booking's
  `payment_status` rollup (Pending / Partially Paid / Fully Paid).
- **Staff/cashier-recorded**: recorded per-transaction on the Transactions
  page via `transactionPayment.service.ts` — the `settle_transaction` RPC,
  which recomputes `bookings.payment_status` in SQL — not the webhook.
  Don't write webhook handling that assumes every event came from a
  customer-initiated payment.

## The `online_payments_enabled` toggle

Online payments are gated per-branch or system-wide by a policy toggle. The
Pay button stays visible-but-disabled in the UI when it's off — but webhook
handling code must still behave correctly (reject/ignore cleanly) if a
payment somehow arrives while the toggle is off, rather than assuming the
toggle guarantees no such event can occur.

## Fees are informational only

PayMongo's published transaction fees are shown to the payer as a
non-blocking informational step. They must never alter the recorded
booking total — the fee is PayMongo's cut, not a change to what the
customer owes the business.

## Sandbox testing

- Use PayMongo test-mode API keys only (see `server/.env.example` for the
  expected env var names) — never real payment credentials in dev.
- Use PayMongo's documented GCash/Maya test payment flows to exercise the
  full webhook round-trip, not just a mocked payload — the signature
  verification step specifically needs a real (test-mode) signed payload
  to test meaningfully.

## Credits are a related but separate concern

Credit issuance/redemption (from a qualifying cancellation, or applied at
checkout) has its own atomicity rules — see
`.agent/skills/credit-balance-ledger.md`. Don't conflate credit-ledger
mutations with payment-webhook handling; they're triggered from different
events.
