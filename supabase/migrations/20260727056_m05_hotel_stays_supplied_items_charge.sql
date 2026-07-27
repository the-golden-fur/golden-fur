-- M05 Pet Hotel follow-up: hotel_stays.supplied_items_charge - the sum of
-- every checked-in care_feeding_instructions/care_medication_instructions
-- row's charged_price (hotel-supplied items), computed and stored at
-- checkout. NULL means nothing was hotel-supplied, never zero - the exact
-- same "NULL vs. zero" convention extension_fee already established (#78),
-- so downstream billing can distinguish "no supplied-item charge" from "a
-- supplied-item charge of exactly PHP 0 was calculated".

alter table public.hotel_stays
  add column supplied_items_charge numeric(10, 2);
