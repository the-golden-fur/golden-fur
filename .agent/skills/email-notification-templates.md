# Email & notification templates

**Purpose:** templates and trigger conditions for the transactional
notification events, so wording and trigger logic stay consistent as
different modules (booking, payment, account) are built out across
sessions.

**Where this lives:** `server/src/features/notifications` (dispatch,
preferences), `server/src/features/messaging` (provider integration).

**Use whenever** adding or changing a notification trigger, template, or
delivery-preference code.

## The event types

Purely reactive — 8 event types, delivered across email and in-app,
non-blockingly via an external provider:

- `account_created`
- `password_reset`
- `booking_confirmed` — fires at booking creation (status: Pending), not
  at any later confirmation step.
- `booking_rescheduled`
- `payment_confirmed` — fires from the **cashier checkout flow**
  specifically. A customer's own self-service online payment does not
  currently trigger this the same way a cashier-recorded payment does —
  don't assume parity between the two payment paths here.
- `appointment_reminder` — see polling mechanism below.
- `booking_cancelled`
- `care_log_completed`

## Preference gating — never skip this

`staff_profiles` and `customer_profiles` each carry a
`notification_preferences` `jsonb` column keyed by event type, storing an
`{email, in_browser}` pair per type (all `true` by default). **Every
dispatch must check the recipient's own preference for that event before
writing the in-app row or sending mail.** Muting one event type must never
affect the rest — check per-event, not a global on/off. Managed from
Settings > Preferences as a grid, one row per event type the viewer's role
can receive.

## Non-blocking dispatch

Notification sends must never block the triggering action (booking
creation, payment, etc.). Dispatch asynchronously/non-blockingly, and
handle send failures with their own logging/retry path — a failed email
must not roll back or delay the underlying booking/payment operation.

## Appointment reminders — polling, not a fixed batch job

Reminders run on a **15-minute polling sweep** over a **3-day lookahead**,
firing each booking's reminder at `scheduled_start` minus the customer's
own configurable lead time (15 min / 1 hr / 3 hr / 1 day / 2 days —
default 1 day). `bookings.reminder_sent_at` is the dedupe marker, claimed
via a single-writer conditional update so a reminder is never sent twice
even under concurrent sweep runs. Don't reintroduce a single fixed daily
batch job — that was the earlier, replaced design.

## Adding a new event type — checklist

1. Add it to the preferences schema/UI (Settings > Preferences) **and**
   the dispatch layer together — a trigger with no corresponding
   preference row silently can't be muted by the recipient.
2. Confirm which flow(s) should fire it, and whether both the
   staff-initiated and customer-initiated variants of that flow (if both
   exist) should trigger it identically, following the
   `payment_confirmed` precedent of these sometimes intentionally
   differing.
3. Keep the send non-blocking, per the rule above.
