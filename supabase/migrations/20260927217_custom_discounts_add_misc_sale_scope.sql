-- Custom change (session 115, Stage C): the Cashier's new "New Misc Sale"
-- wizard gets a real Promo/Discount step - a misc sale has no service_id,
-- package_id, or service_category to match against the existing
-- scope_type in ('service', 'package', 'category') shapes, so this adds a
-- fourth scope that means "applies to any miscellaneous sale at this
-- discount's available branches" - no further sub-scoping, matching how a
-- promo's existing scope_type = 'all_services' already needs no scope row.
--
-- Deliberately NOT reusing/extending the shared public.service_category
-- enum (scope_category's type) - that enum also drives real bookable
-- services (AdminServicesPage's category dropdown), and a "Miscellaneous
-- Sale" value there would let an admin nonsensically create a bookable
-- service in that category. This is a new scope_type value only, with
-- scope_service_id/scope_package_id/scope_category all NULL for it - fully
-- isolated from the booking/services schema.
--
-- Promos need no schema change: evaluatePromos' existing
-- scope_type = 'all_services' branch already matches unconditionally
-- (server/src/features/billing/services/discountPromoEvaluation.service.ts),
-- so an "all_services" promo already applies to a misc sale once that
-- function is called with an empty `items` array - see
-- evaluateMiscSaleDiscounts/evaluateMiscSalePromos in the same file.

alter table public.discounts
  drop constraint discounts_scope_type_check,
  drop constraint discounts_scope_matches_type;

alter table public.discounts
  add constraint discounts_scope_type_check
    check (scope_type in ('service', 'package', 'category', 'misc_sale')),
  add constraint discounts_scope_matches_type check (
    (
      scope_type = 'service'
      and scope_service_id is not null
      and scope_package_id is null
      and scope_category is null
    )
    or (
      scope_type = 'package'
      and scope_package_id is not null
      and scope_service_id is null
      and scope_category is null
    )
    or (
      scope_type = 'category'
      and scope_category is not null
      and scope_service_id is null
      and scope_package_id is null
    )
    or (
      scope_type = 'misc_sale'
      and scope_service_id is null
      and scope_package_id is null
      and scope_category is null
    )
  );
