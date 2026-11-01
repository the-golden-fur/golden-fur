import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import {
  completeBooking,
  startBooking,
} from '../../booking/services/booking.service.ts';
import {
  getOrCreateConsultationIdForBooking,
  updateConsultation,
} from '../../veterinary/services/consultation.service.ts';
import {
  completeFrontDeskBooking,
  startFrontDeskBooking,
} from './frontDeskQueue.service.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('../../booking/services/booking.service.ts', () => ({
  completeBooking: vi.fn(),
  listBookings: vi.fn(),
  startBooking: vi.fn(),
}));
vi.mock('../../veterinary/services/consultation.service.ts', () => ({
  getOrCreateConsultationIdForBooking: vi.fn().mockResolvedValue('c-1'),
  updateConsultation: vi.fn(),
}));

const params = { bookingId: 'b-1', requesterId: 'staff-1', branchId: 'mkt' };

function mockBooking(service_category: string, branch_id = 'mkt') {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn().mockResolvedValue({
    data: { service_category, branch_id },
    error: null,
  });
  vi.mocked(supabase.from).mockReturnValue(builder as never);
}

describe('front desk start/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes a grooming under the receptionist, not the groomer', async () => {
    mockBooking('Grooming');

    await completeFrontDeskBooking({ ...params, servicesDone: [] });

    expect(completeBooking).toHaveBeenCalledWith({
      bookingId: 'b-1',
      staffId: 'staff-1',
    });
  });

  it('completes a vet visit through the billing path, without claiming it', async () => {
    mockBooking('Veterinary');
    const servicesDone = [{ name: 'Surgery', amount: 100 }];

    await completeFrontDeskBooking({ ...params, servicesDone });

    expect(getOrCreateConsultationIdForBooking).toHaveBeenCalledWith('b-1');
    expect(updateConsultation).toHaveBeenCalledWith({
      requesterId: 'staff-1',
      consultationId: 'c-1',
      input: { status: 'Completed', services_done: servicesDone },
      onBehalfOfVet: true,
    });
    expect(completeBooking).not.toHaveBeenCalled();
  });

  it('starts a vet visit without claiming it', async () => {
    mockBooking('Veterinary');

    await startFrontDeskBooking(params);

    expect(updateConsultation).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { status: 'Ongoing' },
        onBehalfOfVet: true,
      })
    );
    expect(startBooking).not.toHaveBeenCalled();
  });

  it.each(['Hotel', 'Daycare'])(
    'refuses %s, which must go through check-out',
    async (category) => {
      mockBooking(category);

      await expect(
        completeFrontDeskBooking({ ...params, servicesDone: [] })
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(completeBooking).not.toHaveBeenCalled();
    }
  );

  it('refuses a booking from another branch', async () => {
    mockBooking('Grooming', 'southwoods');

    await expect(startFrontDeskBooking(params)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(startBooking).not.toHaveBeenCalled();
  });

  it('lets a Superadmin act on any branch', async () => {
    mockBooking('Grooming', 'southwoods');

    await startFrontDeskBooking({ ...params, branchId: null });

    expect(startBooking).toHaveBeenCalled();
  });
});
