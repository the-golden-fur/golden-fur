import { describe, expect, it, vi } from 'vitest';
import { getBookingCatalog } from './catalog.service.ts';
import { listServices } from '../../maintenance/services/services.service.ts';
import { listPackages } from '../../maintenance/services/packages.service.ts';
import { listPromos } from '../../maintenance/services/promos.service.ts';
import { getFixedPrice } from '../../maintenance/services/petTypePriceOverrides.service.ts';

vi.mock('../../maintenance/services/services.service.ts', () => ({
  listServices: vi.fn(),
}));
vi.mock('../../maintenance/services/packages.service.ts', () => ({
  listPackages: vi.fn(),
}));
vi.mock('../../maintenance/services/promos.service.ts', () => ({
  listPromos: vi.fn(),
}));
vi.mock('../../maintenance/services/petTypePriceOverrides.service.ts', () => ({
  getFixedPrice: vi.fn(),
}));

describe('catalog.service (#55/#58 supporting infra)', () => {
  it('returns the active-by-default services/packages/promos for a branch, scoped to the requested category', async () => {
    vi.mocked(listServices).mockResolvedValue([
      { id: 'service-1', base_price: 300 } as never,
    ]);
    vi.mocked(listPackages).mockResolvedValue([{ id: 'package-1' } as never]);
    vi.mocked(listPromos).mockResolvedValue([{ id: 'promo-1' } as never]);

    const result = await getBookingCatalog({
      branchId: 'branch-1',
      category: 'Grooming',
    });

    expect(listServices).toHaveBeenCalledWith({
      branchId: 'branch-1',
      category: 'Grooming',
    });
    expect(listPackages).toHaveBeenCalledWith({ branchId: 'branch-1' });
    expect(listPromos).toHaveBeenCalledWith({});
    expect(getFixedPrice).not.toHaveBeenCalled();
    // No promoCap - each promo carries its own cap (min_spend) now.
    expect(result).toEqual({
      services: [
        { id: 'service-1', base_price: 300, long_stay_nightly_price: null },
      ],
      packages: [{ id: 'package-1' }],
      promos: [{ id: 'promo-1' }],
      fixedPrice: null,
    });
  });

  it('omits category from the services filter when not provided', async () => {
    vi.mocked(listServices).mockResolvedValue([]);
    vi.mocked(listPackages).mockResolvedValue([]);
    vi.mocked(listPromos).mockResolvedValue([]);

    await getBookingCatalog({ branchId: 'branch-1' });

    expect(listServices).toHaveBeenCalledWith({
      branchId: 'branch-1',
      category: undefined,
    });
  });

  it('resolves the fixed-price override for petType/branchId when petType is given, so the customer-facing preview matches the real charged price', async () => {
    vi.mocked(listServices).mockResolvedValue([]);
    vi.mocked(listPackages).mockResolvedValue([]);
    vi.mocked(listPromos).mockResolvedValue([]);
    vi.mocked(getFixedPrice).mockResolvedValue(800);

    const result = await getBookingCatalog({
      branchId: 'branch-1',
      petType: 'Cat',
    });

    expect(getFixedPrice).toHaveBeenCalledWith('Cat', 'branch-1');
    expect(result.fixedPrice).toBe(800);
  });

  it("shows each service at the branch's own price, leaving other branches' prices out of it", async () => {
    vi.mocked(listServices).mockResolvedValue([
      {
        id: 'service-hotel',
        base_price: 850,
        service_branch_availability: [
          { branch_id: 'branch-makati', price_override: null },
          { branch_id: 'branch-southwoods', price_override: 500 },
        ],
      } as never,
      { id: 'service-groom', base_price: 300 } as never,
    ]);
    vi.mocked(listPackages).mockResolvedValue([]);
    vi.mocked(listPromos).mockResolvedValue([]);

    const southwoods = await getBookingCatalog({
      branchId: 'branch-southwoods',
    });
    const makati = await getBookingCatalog({ branchId: 'branch-makati' });

    expect(southwoods.services.map((service) => service.base_price)).toEqual([
      500, 300,
    ]);
    expect(makati.services.map((service) => service.base_price)).toEqual([
      850, 300,
    ]);
  });

  it("shows the Hotel long-stay price at the branch's own, and null for a service without one", async () => {
    vi.mocked(listServices).mockResolvedValue([
      {
        id: 'service-hotel',
        base_price: 850,
        long_stay_nightly_price: 750,
        service_branch_availability: [
          {
            branch_id: 'branch-makati',
            price_override: null,
            long_stay_price_override: null,
          },
          {
            branch_id: 'branch-southwoods',
            price_override: 500,
            long_stay_price_override: 450,
          },
        ],
      } as never,
      { id: 'service-groom', base_price: 300 } as never,
    ]);
    vi.mocked(listPackages).mockResolvedValue([]);
    vi.mocked(listPromos).mockResolvedValue([]);

    const southwoods = await getBookingCatalog({
      branchId: 'branch-southwoods',
    });
    const makati = await getBookingCatalog({ branchId: 'branch-makati' });

    expect(
      southwoods.services.map((service) => service.long_stay_nightly_price)
    ).toEqual([450, null]);
    expect(
      makati.services.map((service) => service.long_stay_nightly_price)
    ).toEqual([750, null]);
  });
});
