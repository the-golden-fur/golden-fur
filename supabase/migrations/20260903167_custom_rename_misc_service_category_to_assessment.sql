-- Renames the 'Misc' service_category enum value to 'Assessment' - the
-- category was always specifically the pre-booking pet assessment step
-- (Initial Assessment / Reassessment), never truly miscellaneous, and the
-- name was confusing staff (see the assessment-queue-page custom change).
-- This single enum is shared by both services.category and
-- discounts.scope_category (see 20260715033_m12_create_discounts_schema.sql),
-- so one RENAME VALUE covers both. Unlike ADD VALUE, RENAME VALUE has no
-- same-transaction restriction.

alter type public.service_category rename value 'Misc' to 'Assessment';
