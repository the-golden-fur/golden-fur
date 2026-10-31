-- Custom change (package fixed price): a Superadmin can give a package a typed
-- price instead of the shared bundle discount. NULL (every existing package)
-- keeps the derived price: included services' base_price minus
-- package_pricing_configuration.bundle_discount_percentage. Set, it IS the
-- package's bundled_price, so booking, the catalog and the weight x coat grid
-- all follow it without changes of their own (packages.service.ts's
-- attachBundledPrice). Same range as cat_price.

alter table public.packages
  add column fixed_price numeric(10, 2)
    check (fixed_price is null or fixed_price >= 0);

comment on column public.packages.fixed_price is
  'This package''s own price, used instead of the bundle discount. NULL = derive it from the included services and bundle_discount_percentage.';
