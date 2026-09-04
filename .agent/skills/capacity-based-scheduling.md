# Capacity-based scheduling

**Purpose:** documents the per-category capacity and overbooking-prevention
rules, so this — the most complex business logic in the app, and the most
cited pain point — is applied the same way everywhere it's touched, rather
than drifting across files or coding sessions.

**Where this lives:** `client/src/features/booking`,
`server/src/features/booking`, `server/src/features/hotel`,
`server/src/features/daycare`; cage/stay schema in `supabase/migrations`.

**Use whenever** implementing or reviewing slot availability, cage
assignment, per-category capacity, or overbooking logic.

## Per-category capacity model

| Category   | Capacity basis                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Grooming   | Groomer-count — number of available groomers at that slot.                                                    |
| Hotel      | Cage-count — available cages, sized S/M/L/XL.                                                                 |
| Daycare    | Session-count per branch. Shares Hotel's `stays` table (`stay_type` discriminator) rather than its own table. |
| Veterinary | Staff-count. **Makati-only** — not offered at Southwoods.                                                     |

**Overbooking is blocked system-wide with no manual override, for every
category.** This is a hard business rule, not a per-branch default that can
be relaxed.

## Cage assignment (Hotel/Daycare)

- Cages have a status enum: Available / Occupied / Reserved / Under
  Maintenance, tracked on the `cages` table.
- The booking-time **Cage Picker** (`bookings.preferred_cage_id`) is
  **advisory only** — it's re-validated at confirmation, and the real
  assignment happens at Hotel check-in via suggest-then-override by weight
  class.
- **Cage size is decoupled from pricing.** It's purely a check-in/capacity
  concern — never reintroduce a price-per-cage-size model. Pricing is a
  flat rate per service (see `daily-sales-report-format.md`).
- A cage that's Occupied or Reserved can't be deleted from the admin Cages
  page.

## Capacity vs. staff availability — two independent gates

A slot must pass **both**:

1. **Capacity** (this doc) — is there a free groomer/cage/session-slot/vet
   for this category at this branch/time?
2. **Staff availability** — `get_staff_availability(staff_id, date, time)`,
   which checks branch operating hours, the branch's lunch break window,
   existing bookings already holding that staff member's slot (Pending, In
   Progress, and Completed all hold it — Cancelled and No-show release it),
   and approved unavailability blocks/leave.

Which staff roles are eligible for a category's Staff Picker is
admin-configurable per service type (`service_types.eligible_staff_roles`,
set in Admin Settings > Service Types alongside `staff_picker_enabled`) —
not implied by the category name. `resolveServiceTypeStaffConfig()`
(`staffPicker.service.ts`) is the single resolution point both the Staff
Picker and `get_staff_availability`'s caller use to look this up.

Don't conflate the two, and don't skip either one when adding a new
capacity check.

## Concurrency — the part that actually causes overbooking bugs

- **Capacity checks must happen server-side, at write time.** The
  customer-facing Slot Picker's availability list is fetched once and can
  go stale between page load and submission — never treat "the client
  showed it as available" as sufficient.
- Guard the check-and-reserve as a single atomic operation (e.g. a
  conditional update / transaction with the right isolation), not a
  separate "check capacity" read followed by a later "create booking"
  write — two concurrent requests can both pass the read before either
  writes.
- Cancelled and no-show bookings must correctly free capacity back up
  immediately — a stale hold is functionally the same bug as an
  overbooking, just inverted.

## Testing expectations

Any new or changed capacity logic needs a test case that simulates
concurrent booking attempts for the same slot/cage/session, not just a
happy-path single-booking test.
