-- Custom change (notifications page + admin announcements): message_threads/
-- message_thread_participants/messages - the schema behind the
-- Admin/Superadmin "announcement" composer. Threads are only ever created by
-- messaging.service.ts's createAnnouncement (Admin/Superadmin, targeted by
-- role checkboxes + an excluded-user list) - there is no general "start a
-- DM with anyone" composer. Once a thread exists, every participant (staff
-- or customer) can reply within it.

-- ---------------------------------------------------------------------------
-- message_threads
-- ---------------------------------------------------------------------------

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  created_by_staff_id uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- message_thread_participants
-- ---------------------------------------------------------------------------
-- participant_staff_id/participant_customer_id mirrors notifications'
-- recipient_staff_id/recipient_customer_id exactly-one-of pattern.
-- Participants are fixed at thread-creation time (the announcement's
-- resolved recipients minus exclusions, plus the composer) - there is no
-- "add participant later" operation. last_read_at is null until the
-- participant opens the thread; null means every message is unread to them.

create table public.message_thread_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  participant_staff_id uuid references public.staff_profiles(id),
  participant_customer_id uuid references public.customer_profiles(id),
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint message_thread_participants_exactly_one_participant check (
    num_nonnulls(participant_staff_id, participant_customer_id) = 1
  )
);

create unique index message_thread_participants_unique_staff_idx
  on public.message_thread_participants(thread_id, participant_staff_id)
  where participant_staff_id is not null;
create unique index message_thread_participants_unique_customer_idx
  on public.message_thread_participants(thread_id, participant_customer_id)
  where participant_customer_id is not null;
create index message_thread_participants_thread_id_idx
  on public.message_thread_participants(thread_id);
create index message_thread_participants_staff_id_idx
  on public.message_thread_participants(participant_staff_id)
  where participant_staff_id is not null;
create index message_thread_participants_customer_id_idx
  on public.message_thread_participants(participant_customer_id)
  where participant_customer_id is not null;

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
-- The announcement's own body is row #1 (sender = the admin who composed
-- it); every reply from any participant is a subsequent row, same
-- exactly-one-of sender pattern.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_staff_id uuid references public.staff_profiles(id),
  sender_customer_id uuid references public.customer_profiles(id),
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_exactly_one_sender check (
    num_nonnulls(sender_staff_id, sender_customer_id) = 1
  )
);

create index messages_thread_id_created_at_idx
  on public.messages(thread_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Every write in this codebase runs through the server's service-role
-- Supabase client (server/src/config/supabase/supabase.config.ts) - there is
-- no code path that inserts as the authenticated end user. So, exactly like
-- notifications' own RLS (whose UPDATE-by-owner policy is never actually
-- exercised either, since markRead/markAllRead also run service-role with
-- ownership checked manually), these policies are SELECT-only and serve as
-- defense-in-depth/documentation rather than live enforcement. A reply's
-- authorization (must be an existing participant) is checked in
-- messaging.controller.ts before the service-role insert runs, mirroring how
-- notifications.controller.ts resolves ownership before calling markRead.

alter table public.message_threads enable row level security;
alter table public.message_thread_participants enable row level security;
alter table public.messages enable row level security;

create policy "Participants can read their threads"
  on public.message_threads
  for select
  to authenticated
  using (
    exists (
      select 1 from public.message_thread_participants p
      where p.thread_id = message_threads.id
        and (p.participant_staff_id = auth.uid() or p.participant_customer_id = auth.uid())
    )
  );

create policy "Participants can read their own membership rows"
  on public.message_thread_participants
  for select
  to authenticated
  using (participant_staff_id = auth.uid() or participant_customer_id = auth.uid());

create policy "Participants can read messages in their threads"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.message_thread_participants p
      where p.thread_id = messages.thread_id
        and (p.participant_staff_id = auth.uid() or p.participant_customer_id = auth.uid())
    )
  );
