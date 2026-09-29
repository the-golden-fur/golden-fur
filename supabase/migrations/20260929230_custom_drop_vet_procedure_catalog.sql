-- Custom change (#117): "As a developer, I want the procedures in vet
-- staff > my catalog dropped, since it will have no use." Drops only the
-- personal procedure-catalog shortcut list (vet_procedure_catalog,
-- 20260825142_m07_create_vet_catalog_schema.sql) - its RLS policies and
-- archive-delete trigger drop automatically with the table. Nothing else
-- in the schema has a foreign key into this table, so this is self-
-- contained.
--
-- Deliberately NOT dropped: the `procedure_type` enum
-- (20260719040_m07_create_veterinary_schema.sql) and
-- consultation_line_items.procedure_type. Those describe the billing
-- category of already-completed consultations' procedure line items -
-- erasing them would be a lossy rewrite of historical billing data that
-- this request didn't ask for. Going forward, the application layer simply
-- stops writing new item_type = 'procedure' rows (ConsultationDetailPanel's
-- Procedures section and consultation.service.ts's line-item generation
-- are both removed in this same change) - the enum/column stay in place,
-- unused by new data, purely so past consultations keep reading correctly.

drop table public.vet_procedure_catalog;
