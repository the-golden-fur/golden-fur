-- Supersedes 20260806102: a flat on/off pair per account can't express
-- per-event-type opt-in/opt-out (e.g. keep booking_cancelled emails but mute
-- appointment_reminder ones), so this replaces the two booleans with one
-- jsonb map keyed by notification_event_type, each value {email, in_browser}.
alter table public.staff_profiles
  drop column email_notifications_enabled;

alter table public.staff_profiles
  drop column in_browser_notifications_enabled;

alter table public.customer_profiles
  drop column email_notifications_enabled;

alter table public.customer_profiles
  drop column in_browser_notifications_enabled;

alter table public.staff_profiles
  add column notification_preferences jsonb not null default '{
    "account_created": {"email": true, "in_browser": true},
    "password_reset": {"email": true, "in_browser": true},
    "booking_confirmed": {"email": true, "in_browser": true},
    "booking_rescheduled": {"email": true, "in_browser": true},
    "booking_cancelled": {"email": true, "in_browser": true},
    "payment_confirmed": {"email": true, "in_browser": true},
    "appointment_reminder": {"email": true, "in_browser": true},
    "care_log_completed": {"email": true, "in_browser": true}
  }'::jsonb;

alter table public.customer_profiles
  add column notification_preferences jsonb not null default '{
    "account_created": {"email": true, "in_browser": true},
    "password_reset": {"email": true, "in_browser": true},
    "booking_confirmed": {"email": true, "in_browser": true},
    "booking_rescheduled": {"email": true, "in_browser": true},
    "booking_cancelled": {"email": true, "in_browser": true},
    "payment_confirmed": {"email": true, "in_browser": true},
    "appointment_reminder": {"email": true, "in_browser": true},
    "care_log_completed": {"email": true, "in_browser": true}
  }'::jsonb;
