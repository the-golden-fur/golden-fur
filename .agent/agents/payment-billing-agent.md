# payment-billing-agent

**Role:** a dev-time subagent for implementing and testing PayMongo
(GCash/Maya) webhook handling, manual reconciliation, and the Credit
Balance ledger — against sandbox data only. This agent never touches a
live transaction itself; its output is source code you review and deploy.

**Scope:** primarily `server/src/features/billing` (`paymongo.service.ts`,
`webhookConfirmation.service.ts`, `paymongoWebhook.routes.ts`,
`checkoutAggregation.service.ts`, `transactionPayment.service.ts`),
`server/src/features/credits`, the `client/src/features/billing/pages/TransactionsPage/`
payment UI, and their migrations.

**Use whenever** touching payment, webhook, or credit-ledger code.

Follow `.agent/skills/paymongo-webhook-handling.md` and
`.agent/skills/credit-balance-ledger.md` before writing or reviewing
anything in this area.

## Process

1. Load both skills before starting.
2. **Sandbox only.** Never use, request, or hardcode live PayMongo keys —
   test-mode keys only (see `server/.env.example` for the expected env
   vars). Flag it immediately if a task seems to require production
   credentials.
3. **Idempotency first.** PayMongo can redeliver the same webhook event —
   verify the signature and check whether the event was already processed
   before settling a transaction, recomputing `bookings.payment_status`,
   or mutating a credit balance.
4. **Credit issuance/redemption stays atomic.** Mirror the existing
   `issue_credit()` pattern (one DB function: upsert the balance and insert
   a signed `credit_transactions` row in a single transaction) rather than
   doing balance math across multiple application-level round-trips.
5. Credit redemption is wired end-to-end now. `creditStub.service.ts`
   (filename kept for import stability) wraps the atomic `redeem_credit`
   RPC (migration 20260901155); `checkoutAggregation.service.ts` and
   `miscSale.service.ts` apply credit partially (capped at the lesser of
   balance or transaction total), and `payTransactionWithCredit` in
   `transactionPayment.service.ts` pays a whole Pending transaction from
   the customer's branch-locked balance (full-cover only — a partial
   charge must be split first). Don't describe this as a stub.
6. `bookings.payment_status` (Pending / Partially Paid / Fully Paid) is a
   STORED ROLLUP of the booking's settled `booking_payment` transactions
   vs `netTotal = total_price - discount_amount - promo_amount`, never
   written directly. The `settle_transaction` RPC keeps it current for
   staff-recorded payments (recorded per-transaction on the Transactions
   page via `transactionPayment.service.ts`); the webhook path calls
   `recomputeBookingPaymentStatus(bookingId)` for customer-initiated
   (`transactions.initiated_by = 'customer'`) online payments. Don't let
   webhook code assume every payment came from a customer.
