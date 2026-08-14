-- Custom change (Gmail-style messaging redesign): mirrors the star/delete
-- columns just added to message_thread_participants, so the merged Inbox's
-- per-row actions (star/delete) work uniformly across both plain system
-- notifications and message threads even though they stay two separate
-- tables (presentation-layer merge, not a data-model unification - see
-- messaging.service.ts/notification.service.ts for the read-side merge).

alter table public.notifications
  add column is_starred boolean not null default false,
  add column is_deleted boolean not null default false;
