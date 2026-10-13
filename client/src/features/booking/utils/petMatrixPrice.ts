import type {
  CoatType,
  Package,
  PricingCell,
  Service,
  WeightClass,
} from '../../maintenance/maintenance.types';

interface PricedPet {
  weight_class: WeightClass | null;
  coat_type: CoatType | null;
  /** Only needed for a package's own cat price (packageFixedPriceForPet). */
  pet_type?: string | null;
}

/** pets.pet_type for a cat - what a package's cat_price applies to. Mirrors
 * the server's own constant (booking.service.ts). */
const CAT_PET_TYPE = 'Cat';

/**
 * Custom change (package cat price): the flat price that settles what this
 * pet pays for this package before any weight x coat grid is looked at - the
 * package's own cat price for a cat, otherwise the pet type's fixed price
 * (null/undefined when it has none). Exactly the precedence
 * resolvePackagePrice uses server-side. Use its result wherever a package
 * needs a `fixedPrice` (packagePriceForPet, isPricedByPetCell).
 */
export function packageFixedPriceForPet(
  pkg: Pick<Package, 'cat_price'>,
  pet: PricedPet | null,
  fixedPrice: number | null | undefined
): number | null | undefined {
  if (pet?.pet_type === CAT_PET_TYPE && pkg.cat_price != null) {
    return Number(pkg.cat_price);
  }

  return fixedPrice;
}

/** The pet's own cell, or null when the pet hasn't been assessed yet (no
 * weight class / coat type) or the item has no such cell. */
function cellPrice(
  cells: PricingCell[] | undefined,
  pet: PricedPet | null
): number | null {
  if (!pet?.weight_class || !pet.coat_type) return null;

  const cell = (cells ?? []).find(
    (entry) =>
      entry.weight_class === pet.weight_class &&
      entry.coat_type === pet.coat_type
  );

  return cell ? Number(cell.price) : null;
}

/**
 * Custom change (per-item weight x coat pricing): what a service costs this
 * pet, exactly as the server charges it (booking.service.ts's
 * resolveServicePrice) - a pet type's fixed price wins; otherwise a Grooming
 * service that varies by weight and coat charges the pet's own cell;
 * otherwise its (branch) base price.
 */
export function servicePriceForPet(
  service: Pick<
    Service,
    'category' | 'base_price' | 'use_pricing_matrix' | 'service_pricing_tiers'
  >,
  pet: PricedPet | null,
  /** null/undefined = the pet type has no fixed price. */
  fixedPrice: number | null | undefined
): number {
  if (fixedPrice != null) return fixedPrice;

  if (service.category === 'Grooming' && service.use_pricing_matrix) {
    return cellPrice(service.service_pricing_tiers, pet) ?? service.base_price;
  }

  return service.base_price;
}

/**
 * Custom change (Hotel long-stay rate, 20261013260): a Hotel service booked
 * for its long-stay night count or more is cheaper per night, automatically.
 * Returns the service with that long-stay price standing in for base_price
 * when it applies - exactly what the server does (nightlyPriceAtBranch) - so
 * it can be handed straight to servicePriceForPet, where a pet type's fixed
 * price still wins. Any other service, or a shorter stay, comes back as is.
 */
export function withLongStayPrice<
  T extends Pick<
    Service,
    | 'category'
    | 'base_price'
    | 'long_stay_nightly_price'
    | 'min_nights_for_free_package'
  >,
>(service: T, nights: number): T {
  if (
    service.category !== 'Hotel' ||
    service.long_stay_nightly_price == null ||
    !service.min_nights_for_free_package ||
    nights < service.min_nights_for_free_package
  ) {
    return service;
  }

  return { ...service, base_price: Number(service.long_stay_nightly_price) };
}

/** Same for a package (resolvePackagePrice): the package's own cat price
 * for a cat, else the pet type's fixed price, else the pet's own cell when
 * the package varies by weight and coat, else bundled_price. */
export function packagePriceForPet(
  pkg: Pick<
    Package,
    'bundled_price' | 'use_pricing_matrix' | 'pricing_tiers' | 'cat_price'
  >,
  pet: PricedPet | null,
  /** null/undefined = the pet type has no fixed price. */
  fixedPrice: number | null | undefined
): number {
  const flatPrice = packageFixedPriceForPet(pkg, pet, fixedPrice);
  if (flatPrice != null) return flatPrice;

  if (pkg.use_pricing_matrix) {
    return cellPrice(pkg.pricing_tiers, pet) ?? pkg.bundled_price;
  }

  return pkg.bundled_price;
}

/** Whether the price shown is the pet's own weight x coat price - for the
 * "Price for L, long coat" hint on the service and package cards. */
export function isPricedByPetCell(
  item: {
    use_pricing_matrix: boolean;
    category?: Service['category'];
    cells: PricingCell[] | undefined;
  },
  pet: PricedPet | null,
  /** null/undefined = the pet type has no fixed price. */
  fixedPrice: number | null | undefined
): boolean {
  if (fixedPrice != null || !item.use_pricing_matrix) return false;
  if (item.category !== undefined && item.category !== 'Grooming') return false;
  return cellPrice(item.cells, pet) !== null;
}
