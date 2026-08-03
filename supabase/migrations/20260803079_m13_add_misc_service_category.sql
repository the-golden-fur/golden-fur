-- New top-level category for administrative services that don't book a
-- real resource (no staff assignment, no capacity contention) - initially
-- just Initial Assessment/Reassessment, moved out of Grooming in the
-- companion migration ...080. `ADD VALUE` must run in its own migration -
-- Postgres does not allow a newly added enum value to be used in the same
-- transaction that added it.

alter type public.service_category add value 'Misc';
