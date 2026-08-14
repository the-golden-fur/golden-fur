-- Custom change (Gmail-style messaging redesign): distinguishes an
-- Announcement thread (Supervisor/Admin/Superadmin, role-targeted) from a
-- Mail thread (anyone to anyone, explicit recipients) so the client can
-- badge/filter by type. Every existing row predates Mail, so it defaults to
-- 'announcement' - the only type that existed before this migration.

create type public.message_thread_type as enum ('mail', 'announcement');

alter table public.message_threads
  add column thread_type public.message_thread_type not null default 'announcement';
