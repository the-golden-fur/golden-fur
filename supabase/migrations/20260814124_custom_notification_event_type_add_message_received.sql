-- Custom change (notifications page + admin announcements): adds the 9th
-- notification_event_type value covering both an announcement's initial
-- delivery and every reply in its thread - notifications.related_thread_id
-- (next migration) is what distinguishes "go read this thread," not the
-- event type, so one value covers both rather than doubling the enum
-- surface for no behavioral gain.
--
-- Must be its own migration: Postgres forbids using a value added by ADD
-- VALUE in the same transaction it was added in - same isolation already
-- used by 20260803079_m13_add_misc_service_category.sql.

alter type public.notification_event_type add value 'message_received';
