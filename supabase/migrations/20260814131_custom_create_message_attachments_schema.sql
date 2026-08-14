-- Custom change (Gmail-style messaging redesign): file attachments on Mail/
-- Announcement messages and replies. Uploads always go through the
-- server's service-role client (attachments.service.ts), same convention
-- as avatarUpload.service.ts/petPhotoUpload.service.ts - the bucket is
-- created here via SQL (unlike 'avatars', which predates this convention
-- and was created manually) so provisioning is version-controlled rather
-- than a manual dashboard step.

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', true)
on conflict (id) do nothing;

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_size bigint not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

create index message_attachments_message_id_idx
  on public.message_attachments(message_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Same SELECT-only/documentation convention as the rest of this schema -
-- every write goes through the service-role client. A participant of the
-- owning thread may read the attachment row (mirrors messages' own
-- participant-membership SELECT policy).

alter table public.message_attachments enable row level security;

create policy "Participants can read attachments in their threads"
  on public.message_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      join public.message_thread_participants p on p.thread_id = m.thread_id
      where m.id = message_attachments.message_id
        and (p.participant_staff_id = auth.uid() or p.participant_customer_id = auth.uid())
    )
  );

-- Storage bucket is public (mirrors 'avatars') so an uploaded file's public
-- URL works directly in an <a>/<img> tag without a signed-URL round trip -
-- attachment *visibility* is still gated by the message_attachments row
-- policy above (an unlisted, unguessable object path is not itself an
-- access control, but nothing in the UI ever surfaces a URL to a non-
-- participant since the row that carries it is already scoped).

create policy "Public can read message attachments"
  on storage.objects
  for select
  to public
  using (bucket_id = 'message-attachments');
