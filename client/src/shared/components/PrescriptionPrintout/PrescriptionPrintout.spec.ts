import { render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  PrescriptionPrintout,
  type PrescriptionPrintoutProps,
} from './PrescriptionPrintout';

const PROPS: PrescriptionPrintoutProps = {
  branchName: 'Golden Fur Makati',
  branchAddress: '123 Ayala Ave, Makati',
  veterinarianName: 'Dr. Reyes',
  petName: 'Whiskers',
  ownerName: 'Jane Doe',
  date: '2026-10-06T02:00:00.000Z',
  medications: [
    {
      name: 'Amoxicillin',
      dose: '50mg',
      medicine_type: 'Oral',
      frequency: 'Twice daily',
      duration: '7 days',
      quantity: 14,
    },
  ],
  onDone: vi.fn(),
};

describe('PrescriptionPrintout', () => {
  it('shows who prescribed it, where, and for which patient', () => {
    render(createElement(PrescriptionPrintout, PROPS));

    const sheet = screen.getByRole('document', { name: 'Prescription' });
    expect(within(sheet).getByText('Golden Fur Makati')).toBeInTheDocument();
    expect(
      within(sheet).getByText('123 Ayala Ave, Makati')
    ).toBeInTheDocument();
    expect(within(sheet).getAllByText('Dr. Reyes').length).toBeGreaterThan(0);
    expect(within(sheet).getByText('Whiskers')).toBeInTheDocument();
    expect(within(sheet).getByText('Jane Doe')).toBeInTheDocument();
  });

  it('lists every medicine with its type, quantity, dose, frequency and duration', () => {
    render(createElement(PrescriptionPrintout, PROPS));

    const row = screen.getByRole('row', { name: /Amoxicillin/ });
    for (const detail of ['Oral', '14', '50mg', 'Twice daily', '7 days']) {
      expect(within(row).getByText(detail)).toBeInTheDocument();
    }
  });

  it('never shows a price - it is for buying at another pharmacy', () => {
    render(createElement(PrescriptionPrintout, PROPS));

    const sheet = screen.getByRole('document', { name: 'Prescription' });
    expect(sheet.textContent).not.toMatch(/₱|price|amount|total/i);
  });

  it('renders straight under <body>, so print styles can hide the rest of the app', () => {
    render(createElement(PrescriptionPrintout, PROPS));

    expect(
      screen.getByRole('document', { name: 'Prescription' }).parentElement
    ).toBe(document.body);
  });

  it('tells its owner when printing has finished', () => {
    const onDone = vi.fn();
    render(createElement(PrescriptionPrintout, { ...PROPS, onDone }));

    window.dispatchEvent(new Event('afterprint'));

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
