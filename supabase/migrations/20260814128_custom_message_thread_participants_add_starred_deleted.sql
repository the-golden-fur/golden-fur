-- Custom change (Gmail-style messaging redesign): per-participant star/
-- delete state for the Starred folder and the delete action - deliberately
-- per participant (not per thread) so one person starring or deleting a
-- shared thread never affects any other participant's view of it. Delete
-- is one-way/soft (no Trash folder was requested) - a deleted row simply
-- stops being returned by getThreadsForRecipient going forward.

alter table public.message_thread_participants
  add column is_starred boolean not null default false,
  add column is_deleted boolean not null default false;
