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

/** Same for a package (resolvePackagePrice): fixed price, else the pet's
 * own cell when the package varies by weight and coat, else bundled_price. */
export function packagePriceForPet(
  pkg: Pick<Package, 'bundled_price' | 'use_pricing_matrix' | 'pricing_tiers'>,
  pet: PricedPet | null,
  /** null/undefined = the pet type has no fixed price. */
  fixedPrice: number | null | undefined
): number {
  if (fixedPrice != null) return fixedPrice;

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
