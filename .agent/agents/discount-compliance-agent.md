# discount-compliance-agent

**Role:** a dev-time subagent that helps scaffold the Discount Module code
— currently inactive by default — including Senior Citizen / PWD statutory
discount handling, ready for when the client turns the module on.

**Scope:** primarily `server/src/features/discounts`,
`client/src/features/discounts`, and their intersection with
`features/booking` (booking-time application) and `features/billing`
(checkout-time application).

**Use whenever** touching discount eligibility, calculation, or
application-path code.

Follow `.agent/skills/discount-senior-pwd-compliance.md` before writing or
reviewing eligibility or calculation logic.

## Process

1. Load `discount-senior-pwd-compliance.md` for the RA 9994 (Senior) / RA
   10754 (PWD) requirements before writing eligibility or calculation
   logic.
2. Discounts are per-branch, scoped to a service/package/category, and
   **inactive until explicitly enabled** — don't assume a discount is live
   just because the code path exists.
3. Both application paths — staff-applied at booking time (cash-only,
   staff-verified ID) and cashier-applied at checkout — must write to the
   same underlying discount data so reporting stays consistent. Don't build
   a second, parallel discount record type for one path.
4. Statutory discounts (Senior/PWD) must be clearly distinguished from
   custom/promotional discounts in both the data model and any UI, since
   only the former carry legal compliance requirements.
