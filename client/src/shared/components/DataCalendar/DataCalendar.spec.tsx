import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataCalendar } from './DataCalendar';

interface Entry {
  id: string;
  date: string;
  label: string;
}

const ENTRIES: Entry[] = [
  { id: '1', date: '2026-09-05', label: 'Rest Day - Maria' },
  { id: '2', date: '2026-09-19', label: 'Sick Leave - Juan' },
];

describe('DataCalendar', () => {
  it('month mode: renders a leading blank for each weekday before the 1st, and a cell per day of the month', () => {
    // September 2026 starts on a Tuesday - 2 leading blanks.
    const { container } = render(
      <DataCalendar
        mode="month"
        anchorDate={new Date(2026, 8, 1)}
        onAnchorDateChange={() => {}}
        items={ENTRIES}
        getItemDate={(entry) => entry.date}
        getRowKey={(entry) => entry.id}
        renderChip={(entry) => <span>{entry.label}</span>}
      />
    );

    expect(container.querySelectorAll('[class*="dayCellBlank"]')).toHaveLength(2);
    expect(container.querySelectorAll('[class*="dayChips"]')).toHaveLength(30);
    expect(screen.getByText('September 2026')).toBeInTheDocument();
  });

  it('month mode: places each item in the cell matching getItemDate, not any other day', () => {
    render(
      <DataCalendar
        mode="month"
        anchorDate={new Date(2026, 8, 1)}
        onAnchorDateChange={() => {}}
        items={ENTRIES}
        getItemDate={(entry) => entry.date}
        getRowKey={(entry) => entry.id}
        renderChip={(entry) => <span>{entry.label}</span>}
      />
    );

    expect(screen.getByText('Rest Day - Maria')).toBeInTheDocument();
    expect(screen.getByText('Sick Leave - Juan')).toBeInTheDocument();
  });

  it('month mode: prev/next nav buttons step by a whole month', async () => {
    const user = userEvent.setup();
    const onAnchorDateChange = vi.fn();

    render(
      <DataCalendar
        mode="month"
        anchorDate={new Date(2026, 8, 1)}
        onAnchorDateChange={onAnchorDateChange}
        items={[]}
        getItemDate={(entry: Entry) => entry.date}
        getRowKey={(entry: Entry) => entry.id}
        renderChip={(entry: Entry) => <span>{entry.label}</span>}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onAnchorDateChange).toHaveBeenCalledWith(new Date(2026, 9, 1));

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onAnchorDateChange).toHaveBeenCalledWith(new Date(2026, 7, 1));
  });

  it('week mode: renders exactly 7 day cells for the week containing anchorDate', () => {
    const { container } = render(
      <DataCalendar
        mode="week"
        anchorDate={new Date(2026, 8, 19)}
        onAnchorDateChange={() => {}}
        items={ENTRIES}
        getItemDate={(entry) => entry.date}
        getRowKey={(entry) => entry.id}
        renderChip={(entry) => <span>{entry.label}</span>}
      />
    );

    expect(container.querySelectorAll('[class*="dayChips"]')).toHaveLength(7);
    expect(screen.getByText('Sick Leave - Juan')).toBeInTheDocument();
  });

  it('week mode: prev/next nav buttons step by 7 days', async () => {
    const user = userEvent.setup();
    const onAnchorDateChange = vi.fn();

    render(
      <DataCalendar
        mode="week"
        anchorDate={new Date(2026, 8, 19)}
        onAnchorDateChange={onAnchorDateChange}
        items={[]}
        getItemDate={(entry: Entry) => entry.date}
        getRowKey={(entry: Entry) => entry.id}
        renderChip={(entry: Entry) => <span>{entry.label}</span>}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(onAnchorDateChange).toHaveBeenCalledWith(new Date(2026, 8, 26));
  });

  it('calls onDayActivate with that day\'s date key when its add button is clicked', async () => {
    const user = userEvent.setup();
    const onDayActivate = vi.fn();

    render(
      <DataCalendar
        mode="month"
        anchorDate={new Date(2026, 8, 1)}
        onAnchorDateChange={() => {}}
        items={[]}
        getItemDate={(entry: Entry) => entry.date}
        getRowKey={(entry: Entry) => entry.id}
        renderChip={(entry: Entry) => <span>{entry.label}</span>}
        onDayActivate={onDayActivate}
        dayActivateLabel={(key) => `Add schedule entry on ${key}`}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Add schedule entry on 2026-09-19' })
    );
    expect(onDayActivate).toHaveBeenCalledWith('2026-09-19');
  });

  it('omits the add button entirely when onDayActivate is not provided', () => {
    render(
      <DataCalendar
        mode="month"
        anchorDate={new Date(2026, 8, 1)}
        onAnchorDateChange={() => {}}
        items={[]}
        getItemDate={(entry: Entry) => entry.date}
        getRowKey={(entry: Entry) => entry.id}
        renderChip={(entry: Entry) => <span>{entry.label}</span>}
      />
    );

    expect(screen.queryByRole('button', { name: /Add/ })).not.toBeInTheDocument();
  });

  it('hides the nav row when showNav is false', () => {
    render(
      <DataCalendar
        mode="month"
        anchorDate={new Date(2026, 8, 1)}
        onAnchorDateChange={() => {}}
        items={[]}
        getItemDate={(entry: Entry) => entry.date}
        getRowKey={(entry: Entry) => entry.id}
        renderChip={(entry: Entry) => <span>{entry.label}</span>}
        showNav={false}
      />
    );

    expect(screen.queryByText('September 2026')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Next month' })
    ).not.toBeInTheDocument();
  });
});
