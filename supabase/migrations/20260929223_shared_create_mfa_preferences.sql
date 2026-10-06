-- Which method a user with more than one enrolled MFA method should be
-- challenged with first at login. Defaults to 'authenticator' (the only
-- method that existed before this table did) so an existing enrolled user
-- with no row here behaves exactly as before once one is upserted on their
-- first preference change; callers treat a missing row the same way.
create table public.mfa_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_method text not null default 'authenticator'
    check (preferred_method in ('authenticator', 'email')),
  updated_at timestamptz not null default now()
);

-- Universal deleted-records archive (20260913202 convention).
create trigger trg_archive_deleted_row
  after delete on public.mfa_preferences
  for each row execute function public.archive_deleted_row();
