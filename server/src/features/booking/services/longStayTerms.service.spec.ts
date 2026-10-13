import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveBookingLongStayTerms,
  resolveLongStayTerms,
} from './longStayTerms.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { getFixedPrice } from '../../maintenance/services/petTypePriceOverrides.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

// Covered by its own spec - here only "does this pet type have a fixed
// price" matters.
vi.mock('../../maintenance/services/petTypePriceOverrides.service.ts', () => ({
  getFixedPrice: vi.fn(),
}));

interface QueryResult {
  data: unknown;
  error: unknown;
}

function queueFromResults(...results: QueryResult[]) {
  const queue = [...results];

  vi.mocked(supabase.from).mockImplementation((() => {
    const result = queue.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};

    for (const method of ['select', 'eq']) {
      builder[method] = vi.fn(() => builder);
    }

    builder.maybeSingle = vi.fn(() => Promise.resolve(result));
    builder.then = (resolve: (_result: QueryResult) => void) => resolve(result);

    return builder;
  }) as never);
}

const OVERNIGHT = {
  category: 'Hotel',
  base_price: 850,
  long_stay_nightly_price: 750,
  min_nights_for_free_package: 5,
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
};
const DOG = { pet_type: 'Dog' };

describe('resolveLongStayTerms (Hotel long-stay rate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFixedPrice).mockResolvedValue(null);
  });

  it("gives the branch's regular rate as what a night past the booking costs", async () => {
    queueFromResults(
      { data: OVERNIGHT, error: null },
      { data: DOG, error: null }
    );

    expect(
      await resolveLongStayTerms('service-hotel', 'branch-makati', 'pet-1')
    ).toEqual({ minNights: 5, longStayRate: 750, regularRate: 850 });
  });

  it("uses a branch's own prices (Southwoods: 450 long stay, 500 regular)", async () => {
    queueFromResults(
      { data: OVERNIGHT, error: null },
      { data: DOG, error: null }
    );

    expect(
      await resolveLongStayTerms('service-hotel', 'branch-southwoods', 'pet-1')
    ).toEqual({ minNights: 5, longStayRate: 450, regularRate: 500 });
  });

  it('is null for a service with no long-stay rate, without looking up the pet', async () => {
    queueFromResults({
      data: { ...OVERNIGHT, long_stay_nightly_price: null },
      error: null,
    });

    expect(
      await resolveLongStayTerms('service-hotel', 'branch-makati', 'pet-1')
    ).toBeNull();
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('is null for a non-Hotel service', async () => {
    queueFromResults({
      data: { ...OVERNIGHT, category: 'Grooming' },
      error: null,
    });

    expect(
      await resolveLongStayTerms('service-bath', 'branch-makati', 'pet-1')
    ).toBeNull();
  });

  it("is null for a pet whose type has a fixed price there - that pet's stay is never on either rate", async () => {
    vi.mocked(getFixedPrice).mockResolvedValue(400);
    queueFromResults(
      { data: OVERNIGHT, error: null },
      { data: { pet_type: 'Cat' }, error: null }
    );

    expect(
      await resolveLongStayTerms('service-hotel', 'branch-makati', 'pet-1')
    ).toBeNull();
    expect(getFixedPrice).toHaveBeenCalledWith('Cat', 'branch-makati');
  });

  it('is null for an item with no service (a package), without touching the database', async () => {
    expect(
      await resolveLongStayTerms(null, 'branch-makati', 'pet-1')
    ).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('resolveBookingLongStayTerms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFixedPrice).mockResolvedValue(null);
  });

  it("finds the deal from the booking's own pet and service item", async () => {
    queueFromResults(
      { data: { pet_id: 'pet-1' }, error: null },
      { data: [{ service_id: 'service-hotel' }], error: null },
      { data: OVERNIGHT, error: null },
      { data: DOG, error: null }
    );

    expect(
      await resolveBookingLongStayTerms('booking-1', 'branch-makati')
    ).toEqual({ minNights: 5, longStayRate: 750, regularRate: 850 });
  });

  it('is null when no item carries one', async () => {
    queueFromResults(
      { data: { pet_id: 'pet-1' }, error: null },
      { data: [{ service_id: null }], error: null }
    );

    expect(
      await resolveBookingLongStayTerms('booking-1', 'branch-makati')
    ).toBeNull();
  });

  it('is null for a booking that cannot be found', async () => {
    queueFromResults({ data: null, error: null });

    expect(
      await resolveBookingLongStayTerms('booking-1', 'branch-makati')
    ).toBeNull();
  });
});
