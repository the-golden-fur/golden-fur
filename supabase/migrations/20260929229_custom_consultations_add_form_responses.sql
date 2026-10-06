-- Custom change (#117 consultation form builder): where a consultation's
-- filled-in custom-form results live. Same "jsonb array on the row, no
-- child table" shape consultations.medications already uses
-- (20260719040_m07_create_veterinary_schema.sql) - a consultation's results
-- are always read in the context of that one consultation/pet, never
-- queried independently of it, so a join buys nothing here.
--
-- Each array entry is a full snapshot, not just a template_id reference:
-- {template_id, template_name, filled_at, fields: [{field_id, label, type,
-- value}]}. template_name and every field's label/type are copied in at
-- fill-time so a past visit's results still read correctly even if the vet
-- later renames/edits/deletes the source vet_consultation_form_templates
-- row - template_id is kept alongside purely as a "was this ever deleted"
-- pointer, not as the source of truth for display.
--
-- No RLS change needed - the existing consultations policies
-- (20260719040_m07_create_veterinary_schema.sql) already cover every column
-- on this table, this is just one more of them. No archive-trigger change
-- either - consultations already carries trg_archive_deleted_row from the
-- 20260913202 backfill.

alter table public.consultations
  add column form_responses jsonb;
