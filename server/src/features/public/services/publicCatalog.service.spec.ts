import { describe, expect, it, vi } from 'vitest';
import { getPublicPackagesPromos } from './publicCatalog.service.ts';
import { listPackages } from '../../maintenance/services/packages.service.ts';
import { listPromos } from '../../maintenance/services/promos.service.ts';
import { listServices } from '../../maintenance/services/services.service.ts';
import { listBranchesFull } from '../../branches/services/branches.service.ts';

vi.mock('../../maintenance/services/packages.service.ts', () => ({
  listPackages: vi.fn(),
}));
vi.mock('../../maintenance/services/promos.service.ts', () => ({
  listPromos: vi.fn(),
}));
vi.mock('../../maintenance/services/services.service.ts', () => ({
  listServices: vi.fn(),
}));
vi.mock('../../branches/services/branches.service.ts', () => ({
  listBranchesFull: vi.fn(),
}));

describe('publicCatalog.service', () => {
  it('returns active packages with resolved branch_names, included services, and computed savings', async () => {
    vi.mocked(listPackages).mockResolvedValue([
      {
        id: 'package-1',
        name: 'Spa Day',
        bundled_price: 800,
        package_services: [
          { service_id: 'service-1' },
          { service_id: 'service-2' },
        ],
        package_branch_availability: [
          {
            package_id: 'package-1',
            branch_id: 'branch-1',
            is_available: true,
          },
          {
            package_id: 'package-1',
            branch_id: 'branch-2',
            is_available: false,
          },
        ],
      } as never,
    ]);
    vi.mocked(listPromos).mockResolvedValue([
      {
        id: 'promo-1',
        name: 'Grand Opening',
        promo_branch_availability: [
          { promo_id: 'promo-1', branch_id: 'branch-1', is_available: true },
          {
            promo_id: 'promo-1',
            branch_id: 'branch-2',
            is_available: false,
          },
        ],
      } as never,
    ]);
    vi.mocked(listBranchesFull).mockResolvedValue([
      { id: 'branch-1', name: 'Makati' } as never,
      { id: 'branch-2', name: 'Southwoods' } as never,
    ]);
    vi.mocked(listServices).mockResolvedValue([
      {
        id: 'service-1',
        name: 'Bath & Brush',
        category: 'Grooming',
        base_price: 500,
      } as never,
      {
        id: 'service-2',
        name: 'Nail Trim',
        category: 'Grooming',
        base_price: 300,
      } as never,
    ]);

    const result = await getPublicPackagesPromos();

    expect(listPackages).toHaveBeenCalledWith({});
    expect(listPromos).toHaveBeenCalledWith({});
    expect(listServices).toHaveBeenCalledWith({ includeInactive: true });
    expect(result.packages).toEqual([
      {
        id: 'package-1',
        name: 'Spa Day',
        bundled_price: 800,
        package_services: [
          { service_id: 'service-1' },
          { service_id: 'service-2' },
        ],
        package_branch_availability: [
          {
            package_id: 'package-1',
            branch_id: 'branch-1',
            is_available: true,
          },
          {
            package_id: 'package-1',
            branch_id: 'branch-2',
            is_available: false,
          },
        ],
        branch_names: ['Makati'],
        included_services: [
          {
            id: 'service-1',
            name: 'Bath & Brush',
            category: 'Grooming',
            base_price: 500,
          },
          {
            id: 'service-2',
            name: 'Nail Trim',
            category: 'Grooming',
            base_price: 300,
          },
        ],
        individual_total_price: 800,
        savings: 0,
      },
    ]);
    expect(result.promos).toEqual([
      {
        id: 'promo-1',
        name: 'Grand Opening',
        promo_branch_availability: [
          { promo_id: 'promo-1', branch_id: 'branch-1', is_available: true },
          {
            promo_id: 'promo-1',
            branch_id: 'branch-2',
            is_available: false,
          },
        ],
        branch_names: ['Makati'],
      },
    ]);
  });

  it('falls back to "Unknown branch" and drops unresolved service links', async () => {
    vi.mocked(listPackages).mockResolvedValue([
      {
        id: 'package-1',
        name: 'Spa Day',
        bundled_price: 450,
        package_services: [
          { service_id: 'service-1' },
          { service_id: 'deleted-service' },
        ],
        package_branch_availability: [
          {
            package_id: 'package-1',
            branch_id: 'missing-branch',
            is_available: true,
          },
        ],
      } as never,
    ]);
    vi.mocked(listPromos).mockResolvedValue([]);
    vi.mocked(listBranchesFull).mockResolvedValue([]);
    vi.mocked(listServices).mockResolvedValue([
      {
        id: 'service-1',
        name: 'Bath & Brush',
        category: 'Grooming',
        base_price: 500,
      } as never,
    ]);

    const result = await getPublicPackagesPromos();

    expect(result.packages[0].branch_names).toEqual(['Unknown branch']);
    expect(result.packages[0].included_services).toEqual([
      {
        id: 'service-1',
        name: 'Bath & Brush',
        category: 'Grooming',
        base_price: 500,
      },
    ]);
    expect(result.packages[0].individual_total_price).toBe(500);
    // bundled_price (450) is below the resolvable individual total (500), so
    // savings should never go negative when a linked service can't be found.
    expect(result.packages[0].savings).toBe(50);
  });
});
