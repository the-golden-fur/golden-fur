-- M05 Pet Hotel follow-up: links care_feeding_instructions/
-- care_medication_instructions rows to the new catalogs, and adds the
-- "did the owner bring this themselves, or does the hotel supply it (and
-- bill for it)" fields. brought_by_customer defaults true - a receptionist
-- must explicitly uncheck it to bill a supplied item, matching
-- notify_opt_in's "explicit opt-in only" convention (#72).
--
-- charged_price is a snapshot taken at check-in time (from the catalog's
-- price at that moment), not a live read of food_catalog/medication_catalog
-- at checkout - so a later catalog price change never retroactively changes
-- an already-checked-in stay's bill, matching source_prescription_note's
-- own "one-time copy, not a live reference" rationale (#73).

alter table public.care_feeding_instructions
  add column food_catalog_id uuid references public.food_catalog(id),
  add column brought_by_customer boolean not null default true,
  add column charged_price numeric(10, 2);

alter table public.care_medication_instructions
  add column medication_catalog_id uuid references public.medication_catalog(id),
  add column brought_by_customer boolean not null default true,
  add column charged_price numeric(10, 2);

-- charged_price is only ever meaningful when the hotel is supplying the
-- item - guards against a row being billed while also marked as customer-
-- brought, which would double up with nothing (the customer already paid
-- for their own food/medication).
alter table public.care_feeding_instructions
  add constraint care_feeding_instructions_charge_requires_supplied
  check (charged_price is null or brought_by_customer = false);

alter table public.care_medication_instructions
  add constraint care_medication_instructions_charge_requires_supplied
  check (charged_price is null or brought_by_customer = false);
