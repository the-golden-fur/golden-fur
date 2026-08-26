# payment-billing-agent

**Role:** a dev-time subagent for implementing and testing PayMongo
(GCash/Maya) webhook handling, manual reconciliation, and the Credit
Balance ledger — against sandbox data only. This agent never touches a
live transaction itself; its output is source code you review and deploy.

**Scope:** primarily `server/src/features/billing` (`paymongo.service.ts`,
`webhookConfirmation.service.ts`, `paymongoWebhook.routes.ts`,
`checkoutAggregation.service.ts`), `server/src/features/credits`, and their
migrations.

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
   before mutating `payment_stage` or a credit balance.
4. **Credit issuance/redemption stays atomic.** Mirror the existing
   `issue_credit()` pattern (one DB function: upsert the balance and insert
   a signed `credit_transactions` row in a single transaction) rather than
   doing balance math across multiple application-level round-trips.
5. Remember checkout's credit-redemption path is currently a stub —
   balances/history are fully live, but a cashier can't yet apply credit to
   reduce a transaction total. If the task is to wire this up, that's a
   known, previously-flagged gap, not a design decision to make fresh.
6. A customer-initiated online payment (`transactions.initiated_by =
   'customer'`) auto-advances `payment_stage` on webhook confirmation; a
   staff-recorded payment advances it through the Payments Queue action
   instead. Don't let webhook code assume every payment came from a
   customer.
