import { describe, expect, it } from 'vitest';
import {
  computeCashChange,
  resolvePaymentConfirmation,
} from './paymentMethod.service.ts';

describe('paymentMethod.service (#83)', () => {
  describe('computeCashChange', () => {
    it('returns tendered minus amount due', () => {
      expect(computeCashChange(450, 500)).toBe(50);
    });

    it('rejects tendered less than amount due', () => {
      expect(() => computeCashChange(500, 450)).toThrow(
        'Cash tendered is less than the amount due'
      );
    });

    it('rounds to the nearest centavo', () => {
      expect(computeCashChange(33.33, 40)).toBe(6.67);
    });
  });

  describe('resolvePaymentConfirmation', () => {
    it('Cash is confirmed immediately with computed change', () => {
      const result = resolvePaymentConfirmation({
        paymentMethod: 'Cash',
        amountDue: 450,
        cashTendered: 500,
      });

      expect(result).toEqual({ paymentStatus: 'Fully Paid', changeAmount: 50 });
    });

    it('Card/Bank Transfer/Grabmart/Pickaroo are confirmed immediately with no change', () => {
      const result = resolvePaymentConfirmation({
        paymentMethod: 'Card',
        amountDue: 450,
      });

      expect(result).toEqual({
        paymentStatus: 'Fully Paid',
        changeAmount: null,
      });
    });

    it('GCash/Maya walk-in QR is confirmed immediately, same as a manual method', () => {
      const result = resolvePaymentConfirmation({
        paymentMethod: 'GCash',
        onlineChannel: 'walk_in_qr',
        amountDue: 450,
      });

      expect(result).toEqual({
        paymentStatus: 'Fully Paid',
        changeAmount: null,
      });
    });

    it('GCash/Maya portal stays Pending until the webhook confirms it', () => {
      const result = resolvePaymentConfirmation({
        paymentMethod: 'Maya',
        onlineChannel: 'portal',
        amountDue: 450,
      });

      expect(result).toEqual({ paymentStatus: 'Pending', changeAmount: null });
    });
  });
});
