import { render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  TransactionReceiptPrintout,
  type TransactionReceiptPrintoutProps,
} from './TransactionReceiptPrintout';

const PROPS: TransactionReceiptPrintoutProps = {
  branchName: 'Makati Branch',
  branchAddress: '123 Ayala Ave, Makati',
  branchContactNumber: '0917 000 0000',
  title: 'Receipt',
  reference: 'TXN-1A2B',
  date: '2026-10-06T02:00:00.000Z',
  customerName: 'Jane Doe',
  petName: 'Whiskers',
  description: 'Booking payment',
  service: 'Grooming',
  paymentLabel: 'Down payment',
  method: 'GCash',
  statusLabel: 'Fully Paid',
  amount: 1500,
  onDone: vi.fn(),
};

describe('TransactionReceiptPrintout', () => {
  it('shows where, who, what was paid for, and how much', () => {
    render(createElement(TransactionReceiptPrintout, PROPS));

    const sheet = screen.getByRole('document', { name: 'Receipt' });
    for (const detail of [
      'Golden Fur',
      'Makati Branch',
      '123 Ayala Ave, Makati',
      '0917 000 0000',
      'Jane Doe',
      'Whiskers',
      'Booking payment',
      'Grooming',
      'Down payment',
      'GCash',
      'Fully Paid',
      '₱1,500.00',
    ]) {
      expect(within(sheet).getByText(detail)).toBeInTheDocument();
    }
  });

  it('prints the reference as a barcode, with the reference readable underneath', () => {
    render(createElement(TransactionReceiptPrintout, PROPS));

    const sheet = screen.getByRole('document', { name: 'Receipt' });
    const barcode = within(sheet).getByRole('img', {
      name: 'Barcode TXN-1A2B',
    });
    // Start + 8 characters + checksum + stop, three bars each (stop has four).
    expect(barcode.querySelectorAll('rect')).toHaveLength(11 * 3 + 1);
    // Once in the details, once under the bars.
    expect(within(sheet).getAllByText('TXN-1A2B')).toHaveLength(2);
  });

  it('leaves out the lines it has nothing for, down to just the business name', () => {
    render(
      createElement(TransactionReceiptPrintout, {
        ...PROPS,
        branchName: null,
        branchAddress: null,
        branchContactNumber: null,
        title: 'Payment Due',
        petName: null,
        service: null,
        paymentLabel: null,
        method: null,
      })
    );

    const sheet = screen.getByRole('document', { name: 'Payment Due' });
    expect(within(sheet).getByText('Golden Fur')).toBeInTheDocument();
    expect(sheet.querySelector('header')?.children).toHaveLength(1);
    for (const label of ['Pet', 'Service', 'Payment', 'Method']) {
      expect(within(sheet).queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('renders straight under <body>, so print styles can hide the rest of the app', () => {
    render(createElement(TransactionReceiptPrintout, PROPS));

    expect(
      screen.getByRole('document', { name: 'Receipt' }).parentElement
    ).toBe(document.body);
  });

  it('tells its owner when printing has finished', () => {
    const onDone = vi.fn();
    render(createElement(TransactionReceiptPrintout, { ...PROPS, onDone }));

    window.dispatchEvent(new Event('afterprint'));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
