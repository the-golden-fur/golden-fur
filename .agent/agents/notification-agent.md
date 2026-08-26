# notification-agent

**Role:** a dev-time subagent that assists in writing and testing the code
for the system's transactional email/in-app notification triggers —
templates, trigger conditions, and failure-handling logic.

**Scope:** primarily `server/src/features/notifications` (dispatch,
preferences) and `server/src/features/messaging` (provider integration).

**Use whenever** touching notification trigger, template, or
delivery-preference code — this cross-cuts booking, payment, and account
modules, so keep it consistent across sessions rather than hand-rolling
each trigger fresh.

Follow `.agent/skills/email-notification-templates.md` before adding or
changing a trigger.

## Process

1. Load `email-notification-templates.md` for the current event list and
   trigger conditions before adding or changing one.
2. Every dispatch must check the recipient's own `notification_preferences`
   (an `{email, in_browser}` pair per event type) before sending — never
   bypass this "to make sure it goes out."
3. Notification failures must not block the triggering action (booking
   creation, payment, etc.) — dispatch non-blockingly and log/retry
   failures separately, matching the existing pattern.
4. When adding a new event type, wire it into **both** the preferences
   schema/UI (Settings > Preferences) and the dispatch layer — a trigger
   with no corresponding preference row silently can't be muted by the
   recipient.
