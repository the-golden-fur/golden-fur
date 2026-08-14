-- Custom change (Gmail-style messaging redesign): the Drafts folder - an
-- in-progress Mail or Announcement composition that hasn't been sent yet,
-- so it has no thread/participants of its own. recipients is a jsonb blob
-- because Mail and Announcement have entirely different recipient shapes
-- (an explicit staff/customer id list vs. role checkboxes + exclusions) -
-- sendDraft (drafts.service.ts) reconstructs the right params from it and
-- deletes the draft row once the real thread is created.

create table public.message_drafts (
  id uuid primary key default gen_random_uuid(),
  author_staff_id uuid references public.staff_profiles(id),
  author_customer_id uuid references public.customer_profiles(id),
  message_type public.message_thread_type not null,
  subject text,
  body text,
  recipients jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_drafts_exactly_one_author check (
    num_nonnulls(author_staff_id, author_customer_id) = 1
  )
);

create index message_drafts_staff_author_idx
  on public.message_drafts(author_staff_id)
  where author_staff_id is not null;
create index message_drafts_customer_author_idx
  on public.message_drafts(author_customer_id)
  where author_customer_id is not null;

-- RLS: same SELECT-only/documentation convention as the rest of this
-- schema (every write goes through the server's service-role client,
-- ownership checked in drafts.service.ts) - a draft has no participant
-- concept, it's private to its author only.

alter table public.message_drafts enable row level security;

create policy "Authors can read their own drafts"
  on public.message_drafts
  for select
  to authenticated
  using (author_staff_id = auth.uid() or author_customer_id = auth.uid());
