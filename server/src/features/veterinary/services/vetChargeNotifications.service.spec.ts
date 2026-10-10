import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyMedicineChargeChange,
  notifyVisitCharges,
} from './vetChargeNotifications.service.ts';
import { supabase } from '../../../config/supabase/supabase.config.ts';
import { createNotification } from '../../notifications/services/notification.service.ts';
import { sendVetChargeEmail } from '../../../shared/email/vetChargeEmail.ts';

vi.mock('../../../config/supabase/supabase.config.ts', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('../../notifications/services/notification.service.ts', () => ({
  createNotification: vi.fn(),
}));

vi.mock('../../../shared/email/vetChargeEmail.ts', () => ({
  sendVetChargeEmail: vi.fn(),
}));

const ROWS: Record<string, unknown> = {
  bookings: { id: 'booking-1', customer_id: 'customer-1', branch_id: 'b-1' },
  customer_profiles: { account_email: 'owner@example.com' },
  branches: { name: 'Makati' },
  pets: { name: 'Max' },
};

const CONSULTATION = {
  id: 'consultation-1',
  booking_id: 'booking-1',
  pet_id: 'pet-1',
};

const AMOXICILLIN_LINE = {
  description: 'Amoxicillin',
  quantity: 2,
  unit_price: 250,
  line_total: 500,
};

function sentNotification() {
  return vi.mocked(createNotification).mock.calls[0]?.[0];
}

describe('vetChargeNotifications.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createNotification).mockResolvedValue(null);
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(() =>
        Promise.resolve({ data: ROWS[table] ?? null, error: null })
      );
      return builder;
    }) as never);
  });

  describe('notifyVisitCharges', () => {
    it('sends the customer one notification itemizing the services done and the medicines, with the total', async () => {
      await notifyVisitCharges({
        consultation: CONSULTATION,
        servicesDone: [{ name: 'Surgery', amount: 10000 }],
        pharmacyPlan: {
          locked: false,
          existing: null,
          lines: [AMOXICILLIN_LINE],
        },
      });

      expect(createNotification).toHaveBeenCalledTimes(1);
      expect(sentNotification()).toMatchObject({
        recipientCustomerId: 'customer-1',
        eventType: 'vet_charge_posted',
        title: 'Veterinary charges added',
        relatedBookingId: 'booking-1',
      });

      const message = sentNotification()?.message ?? '';
      expect(message).toContain("Max's veterinary visit");
      expect(message).toContain('Surgery ₱10,000.00');
      expect(message).toContain('Amoxicillin x2 ₱500.00');
      expect(message).toContain('Total ₱10,500.00');
    });

    it('emails the same message to the customer', async () => {
      await notifyVisitCharges({
        consultation: CONSULTATION,
        servicesDone: [{ name: 'Surgery', amount: 10000 }],
        pharmacyPlan: null,
      });

      await sentNotification()?.sendEmail?.();

      expect(sendVetChargeEmail).toHaveBeenCalledWith({
        to: 'owner@example.com',
        petName: 'Max',
        branchName: 'Makati',
        message: sentNotification()?.message,
      });
    });

    it('sends nothing when the visit charged nothing', async () => {
      await notifyVisitCharges({
        consultation: CONSULTATION,
        servicesDone: [],
        pharmacyPlan: { locked: false, existing: null, lines: [] },
      });

      expect(createNotification).not.toHaveBeenCalled();
    });

    it('never fails the save when the notification cannot be created', async () => {
      vi.mocked(createNotification).mockRejectedValue(new Error('db down'));
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        notifyVisitCharges({
          consultation: CONSULTATION,
          servicesDone: [{ name: 'Surgery', amount: 10000 }],
          pharmacyPlan: null,
        })
      ).resolves.toBeUndefined();

      consoleError.mockRestore();
    });
  });

  describe('notifyMedicineChargeChange', () => {
    it('announces a medicine charge added to a finished visit', async () => {
      await notifyMedicineChargeChange({
        consultation: CONSULTATION,
        plan: { locked: false, existing: null, lines: [AMOXICILLIN_LINE] },
      });

      expect(sentNotification()?.title).toBe('Veterinary charges added');
      expect(sentNotification()?.message).toContain('Total ₱500.00');
    });

    it('announces the new amount when the medicine charge changed', async () => {
      await notifyMedicineChargeChange({
        consultation: CONSULTATION,
        plan: {
          locked: false,
          existing: { id: 'txn-1', total_amount: 250 },
          lines: [AMOXICILLIN_LINE],
        },
      });

      expect(sentNotification()?.title).toBe('Medicine charge updated');
      expect(sentNotification()?.message).toContain('Total ₱500.00');
    });

    it('announces the amount taken off when the medicine charge was removed', async () => {
      await notifyMedicineChargeChange({
        consultation: CONSULTATION,
        plan: {
          locked: false,
          existing: { id: 'txn-1', total_amount: 500 },
          lines: [],
        },
      });

      expect(sentNotification()?.title).toBe('Medicine charge removed');
      expect(sentNotification()?.message).toContain('₱500.00');
    });

    it.each([
      [
        'the amount is unchanged',
        {
          locked: false,
          existing: { id: 'txn-1', total_amount: 500 },
          lines: [AMOXICILLIN_LINE],
        },
      ],
      [
        'the charge is already paid',
        { locked: true, existing: null, lines: [] },
      ],
      ['nothing is billed', { locked: false, existing: null, lines: [] }],
    ])('stays silent when %s', async (_label, plan) => {
      await notifyMedicineChargeChange({ consultation: CONSULTATION, plan });

      expect(createNotification).not.toHaveBeenCalled();
    });
  });
});
