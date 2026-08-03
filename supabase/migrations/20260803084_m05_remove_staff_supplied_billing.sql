-- Booking flow & pricing revamp (#22): staff are no longer allowed to buy
-- food/medication on a customer's behalf (it placed billing/liability risk
-- on staff that the business no longer wants). This removes the "hotel
-- supplies this, bill the customer" path entirely, including for past
-- stays - the historical remaining-balance detail for any stay that used
-- it is lost, but no already-collected total is affected: checkout.service.
-- ts's remainingBalance (and lineItemSources.service.ts's mirrored line
-- items) were always computed live at checkout time, never persisted onto
-- bookings.total_price.

alter table public.care_feeding_instructions
  drop constraint care_feeding_instructions_charge_requires_supplied;

alter table public.care_medication_instructions
  drop constraint care_medication_instructions_charge_requires_supplied;

alter table public.care_feeding_instructions
  drop column brought_by_customer,
  drop column charged_price;

alter table public.care_medication_instructions
  drop column brought_by_customer,
  drop column charged_price;

alter table public.hotel_stays
  drop column supplied_items_charge;
