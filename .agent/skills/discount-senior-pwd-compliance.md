# Senior/PWD discount compliance

**Purpose:** a checklist referencing Philippine Senior Citizen (RA 9994)
and PWD (RA 10754) discount law, for when the Discount Module's statutory
handling gets built out. The module is inactive by default today — this
is the reference to have ready before that changes.

**Where this lives:** `server/src/features/discounts`,
`client/src/features/discounts`; intersects `features/booking`
(booking-time application) and `features/billing` (checkout-time
application).

**Use whenever** implementing or reviewing discount eligibility or
calculation logic, especially anything Senior/PWD-specific.

## Statutory basics

- **Senior Citizen (RA 9994)** — 20% discount for qualifying senior
  citizens on covered goods/services.
- **PWD (RA 10754)** — 20% discount for persons with disability on
  covered goods/services, extended parity with the senior citizen
  discount.
- Both require **ID verification** at the point of application — this is
  a legal requirement, not just a UX nicety. The current design is
  cash-only, staff-verified ID when applied at booking time.

## How discounts are structured in this system

- Discounts are **standing, per-branch** configurations (percentage or
  flat), scoped to a specific service, a package, or an entire service
  category.
- Senior Citizen and PWD discounts are **built in** as discount types,
  distinct from custom/promotional discounts — keep this distinction
  explicit in the data model and any UI, since only the statutory types
  carry legal compliance requirements (e.g. can't be disabled selectively
  the way a promo can, must apply the correct statutory rate, need ID
  verification logged).
- The whole module is **inactive by default** and must be explicitly
  enabled — don't assume it's live just because the code path exists in
  the repo.

## Two application paths — one data model

Discounts can be applied in two places, and **both must write to the same
underlying discount data** so reporting stays consistent:

1. **Booking time** (`features/booking`) — staff-applied, cash-only,
   staff-verified ID for Senior/PWD/custom. Snapshots
   `selected_discount_id`/`discount_amount` onto the booking as a lock-in;
   `total_price` stays the pre-discount sum.
2. **Checkout time** (`features/billing`) — the cashier UI allows applying
   an eligible discount not already selected earlier. Government-mandated
   discounts (Senior Citizen, PWD) apply automatically once the cashier
   flags eligibility.

Don't build a second, parallel discount record type for one path just
because the trigger point differs — that's how the two paths silently
diverge and reporting stops reconciling.

## When this module actually gets activated

Before turning it on for real use, confirm: ID-verification logging is in
place for statutory discounts, the correct statutory rate is
non-editable/protected from being configured incorrectly per branch, and
both application paths are covered by tests exercising the
Senior/PWD-specific eligibility rules, not just the generic
percentage/flat discount math.
