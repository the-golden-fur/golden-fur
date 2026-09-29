-- Custom change: My Catalog > Forms gets an icon, same curated-Lucide-icon
-- pattern services/service types/packages and vet_medication_catalog
-- already have (20260914203, 20260929234) - nullable, a form template with
-- no icon simply renders with none, same as before this change.

alter table public.vet_consultation_form_templates add column icon text;
