-- Custom change (pet delete reason): when a customer deletes (archives) a
-- pet from Pet Manager, they pick why - a preset reason, or 'other' with
-- their own short text. Stored now, reserved for a future Trends tab that
-- charts the reasons; nothing displays these columns yet.
--
-- archive_reason is a code (not free text) so the trends can group by it;
-- archive_reason_other only holds the custom text for 'other'. Restoring a
-- pet clears both (petArchive.service.ts), so a restored pet doesn't count.
--
-- No RLS changes: the archive write goes through the server's service-role
-- Supabase client (petArchive.service.ts). Both columns are nullable with
-- no default, so the existing pet seeds need no change.

alter table public.pets
  add column archive_reason text
    check (
      archive_reason in (
        'passed_away',
        'rehomed',
        'duplicate',
        'no_longer_using_clinic',
        'other'
      )
    ),
  add column archive_reason_other text
    check (char_length(archive_reason_other) <= 200);
