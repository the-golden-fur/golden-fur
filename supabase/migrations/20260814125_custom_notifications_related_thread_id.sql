-- Custom change (notifications page + admin announcements): links a
-- 'message_received' notification row back to the message_threads row it
-- was raised for, so selecting it in the bell/notifications page can open
-- the right thread. Nullable, mirroring related_booking_id's own
-- nullability - every other event type never sets this.

alter table public.notifications
  add column related_thread_id uuid references public.message_threads(id);
