import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setPackagePricingCells,
  setServicePricingCells,
} from './pricingCells.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getServiceById } from './services.service.ts';
import { getPackageById } from './packages.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('./services.service.ts', () => ({ getServiceById: vi.fn() }));
vi.mock('./packages.service.ts', () => ({ getPackageById: vi.fn() }));

interface Call {
  table: string;
  method: string;
  args: unknown[];
}

let calls: Call[] = [];

function stubWrites(result: { error: unknown } = { error: null }) {
  calls = [];
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ['upsert', 'delete', 'eq']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      });
    }
    builder.then = (resolve: (_value: unknown) => void) => resolve(result);
    return builder;
  }) as never);
}

const GROOMING_SERVICE = {
  id: 'service-bath',
  category: 'Grooming',
  archived_at: null,
};

const PARAMS = {
  requesterId: 'super-1',
  requesterRole: 'Superadmin',
  cells: [
    { weight_class: 'L' as const, coat_type: 'LC' as const, price: 650 },
    { weight_class: 'S' as const, coat_type: 'SC' as const, price: null },
  ],
};

describe('pricingCells.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubWrites();
  });

  it('saves set cells and puts null cells back on the formula', async () => {
    vi.mocked(getServiceById).mockResolvedValue(GROOMING_SERVICE as never);

    await setServicePricingCells('service-bath', PARAMS);

    const upsert = calls.find((call) => call.method === 'upsert');
    expect(upsert?.table).toBe('service_pricing_cell_overrides');
    expect(upsert?.args[0]).toEqual([
      expect.objectContaining({
        service_id: 'service-bath',
        weight_class: 'L',
        coat_type: 'LC',
        price: 650,
        updated_by: 'super-1',
      }),
    ]);
    expect(upsert?.args[1]).toEqual({
      onConflict: 'service_id,weight_class,coat_type',
    });

    expect(calls.filter((call) => call.method === 'delete')).toHaveLength(1);
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['weight_class', 'S'] })
    );
    // Returns the service as it now reads.
    expect(getServiceById).toHaveBeenCalledTimes(2);
  });

  it('is Superadmin-only', async () => {
    await expect(
      setServicePricingCells('service-bath', {
        ...PARAMS,
        requesterRole: 'Admin',
      })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('only prices Grooming services by weight and coat', async () => {
    vi.mocked(getServiceById).mockResolvedValue({
      ...GROOMING_SERVICE,
      category: 'Hotel',
    } as never);

    await expect(
      setServicePricingCells('service-bath', PARAMS)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses an archived package', async () => {
    vi.mocked(getPackageById).mockResolvedValue({
      id: 'package-1',
      archived_at: '2026-10-01T00:00:00.000Z',
    } as never);

    await expect(
      setPackagePricingCells('package-1', PARAMS)
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("writes a package's cells to its own table", async () => {
    vi.mocked(getPackageById).mockResolvedValue({
      id: 'package-1',
      archived_at: null,
    } as never);

    await setPackagePricingCells('package-1', PARAMS);

    const upsert = calls.find((call) => call.method === 'upsert');
    expect(upsert?.table).toBe('package_pricing_cell_overrides');
    expect(upsert?.args[0]).toEqual([
      expect.objectContaining({ package_id: 'package-1', price: 650 }),
    ]);
  });
});
