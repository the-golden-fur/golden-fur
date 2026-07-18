import { describe, expect, it, vi } from 'vitest';
import { getBookingCatalog } from './catalog.service.ts';
import { listServices } from '../../maintenance/services/services.service.ts';
import { listPackages } from '../../maintenance/services/packages.service.ts';
import { listPromos } from '../../maintenance/services/promos.service.ts';

vi.mock('../../maintenance/services/services.service.ts', () => ({
  listServices: vi.fn(),
}));
vi.mock('../../maintenance/services/packages.service.ts', () => ({
  listPackages: vi.fn(),
}));
vi.mock('../../maintenance/services/promos.service.ts', () => ({
  listPromos: vi.fn(),
}));

describe('catalog.service (#55/#58 supporting infra)', () => {
  it('returns the active-by-default services/packages/promos for a branch, scoped to the requested category', async () => {
    vi.mocked(listServices).mockResolvedValue([
      { id: 'service-1' } as never,
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
    expect(result).toEqual({
      services: [{ id: 'service-1' }],
      packages: [{ id: 'package-1' }],
      promos: [{ id: 'promo-1' }],
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
});
