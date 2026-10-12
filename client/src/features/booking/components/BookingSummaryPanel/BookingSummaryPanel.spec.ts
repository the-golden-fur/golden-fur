import { fireEvent, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  BookingSummaryPanel,
  type BookingSummaryRow,
} from './BookingSummaryPanel';

function renderPanel(
  rows: BookingSummaryRow[],
  overrides: Partial<Parameters<typeof BookingSummaryPanel>[0]> = {}
) {
  return render(
    createElement(BookingSummaryPanel, {
      rows,
      committedEntries: [],
      subtotal: 0,
      ...overrides,
    })
  );
}

describe('BookingSummaryPanel', () => {
  it('shows each step with its status and what was chosen', () => {
    renderPanel(
      [
        {
          key: 'branch',
          label: 'Branch',
          status: 'done',
          lines: [{ text: 'Makati' }],
        },
        {
          key: 'items',
          label: 'Services',
          status: 'current',
          lines: [{ text: 'Bath', amount: 300 }],
        },
        { key: 'payment', label: 'Review', status: 'upcoming', lines: [] },
      ],
      { subtotal: 300 }
    );

    const rows = screen
      .getAllByRole('listitem')
      .filter((item) => item.parentElement?.tagName === 'OL');
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveTextContent('Branch');
    expect(rows[0]).toHaveTextContent('(completed)');
    expect(rows[0]).toHaveTextContent('Makati');

    expect(rows[1]).toHaveAttribute('aria-current', 'step');
    expect(rows[1]).toHaveTextContent('Bath');
    expect(rows[1]).toHaveTextContent('PHP 300.00');

    expect(rows[2]).toHaveTextContent('(not started)');

    expect(screen.getByText('Subtotal').parentElement).toHaveTextContent(
      'PHP 300.00'
    );
  });

  it('shows the subtotal alone until a discount or promo is applied', () => {
    renderPanel([], { subtotal: 300 });

    expect(screen.getByText('Subtotal').parentElement).toHaveTextContent(
      'PHP 300.00'
    );
    expect(screen.queryByText('Estimated total')).not.toBeInTheDocument();
    expect(
      screen.getByText('Discounts and promos are applied on the Review step.')
    ).toBeInTheDocument();
  });

  it('shows the reduction and the estimated total once one is applied', () => {
    renderPanel([], { subtotal: 300, reduction: 30 });

    expect(screen.getByText('Subtotal').parentElement).toHaveTextContent(
      'PHP 300.00'
    );
    expect(
      screen.getByText('Discounts & promos').parentElement
    ).toHaveTextContent('-PHP 30.00');
    expect(screen.getByText('Estimated total').parentElement).toHaveTextContent(
      'PHP 270.00'
    );
    expect(
      screen.queryByText('Discounts and promos are applied on the Review step.')
    ).not.toBeInTheDocument();
  });

  it('never shows an estimated total below zero', () => {
    renderPanel([], { subtotal: 100, reduction: 150 });

    expect(screen.getByText('Estimated total').parentElement).toHaveTextContent(
      'PHP 0.00'
    );
  });

  it('lets a reachable row jump back to its step, and leaves others inert', () => {
    const onSelect = vi.fn();
    renderPanel([
      {
        key: 'pet',
        label: 'Pet',
        status: 'done',
        lines: [{ text: 'Rex' }],
        onSelect,
      },
      { key: 'category', label: 'Service Type', status: 'current', lines: [] },
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Pet/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);

    // Only rows given an onSelect are buttons.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('lists bookings already committed to this checkout', () => {
    renderPanel([], {
      committedEntries: [
        {
          id: 'entry-1',
          title: 'Rex — Grooming',
          lines: ['Bath', 'Oct 3, 2026, 10:00 AM'],
          subtotal: 300,
        },
      ],
    });

    const section = screen.getByRole('region', { name: 'In this checkout' });
    expect(within(section).getByText('Rex — Grooming')).toBeInTheDocument();
    expect(within(section).getByText('Bath')).toBeInTheDocument();
    expect(within(section).getByText('PHP 300.00')).toBeInTheDocument();
  });

  it('hides the checkout section when nothing is committed yet', () => {
    renderPanel([]);
    expect(
      screen.queryByRole('region', { name: 'In this checkout' })
    ).not.toBeInTheDocument();
  });
});
