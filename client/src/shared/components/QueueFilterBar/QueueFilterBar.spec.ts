import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueueFilterBar } from './QueueFilterBar';

describe('QueueFilterBar', () => {
  it('renders the date preset options and the given status options', () => {
    render(
      createElement(QueueFilterBar, {
        dateRangePreset: 'today',
        onDateRangePresetChange: vi.fn(),
        customDate: '',
        onCustomDateChange: vi.fn(),
        statusValue: 'All',
        onStatusChange: vi.fn(),
        statusOptions: [
          { value: 'All', label: 'All statuses' },
          { value: 'Waiting', label: 'Waiting' },
        ],
      })
    );

    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.getByText('This month')).toBeInTheDocument();
    expect(screen.getByText('Custom date')).toBeInTheDocument();
    expect(screen.getByText('All dates')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('All statuses')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('calls onDateRangePresetChange when the date select changes', async () => {
    const onDateRangePresetChange = vi.fn();
    render(
      createElement(QueueFilterBar, {
        dateRangePreset: 'today',
        onDateRangePresetChange,
        customDate: '',
        onCustomDateChange: vi.fn(),
        statusValue: 'All',
        onStatusChange: vi.fn(),
        statusOptions: [{ value: 'All', label: 'All statuses' }],
      })
    );

    await userEvent.selectOptions(screen.getByLabelText('Date'), 'this_week');

    expect(onDateRangePresetChange).toHaveBeenCalledWith('this_week');
  });

  it('does not show a custom-date input unless "Custom date" is selected', () => {
    render(
      createElement(QueueFilterBar, {
        dateRangePreset: 'today',
        onDateRangePresetChange: vi.fn(),
        customDate: '',
        onCustomDateChange: vi.fn(),
        statusValue: 'All',
        onStatusChange: vi.fn(),
        statusOptions: [{ value: 'All', label: 'All statuses' }],
      })
    );

    expect(screen.queryByLabelText('Custom date')).not.toBeInTheDocument();
  });

  it('shows a custom-date input and calls onCustomDateChange when "Custom date" is selected', async () => {
    const onCustomDateChange = vi.fn();
    render(
      createElement(QueueFilterBar, {
        dateRangePreset: 'custom',
        onDateRangePresetChange: vi.fn(),
        customDate: '2026-07-24',
        onCustomDateChange,
        statusValue: 'All',
        onStatusChange: vi.fn(),
        statusOptions: [{ value: 'All', label: 'All statuses' }],
      })
    );

    const customDateInput = screen.getByLabelText('Custom date');
    expect(customDateInput).toHaveValue('2026-07-24');

    fireEvent.change(customDateInput, { target: { value: '2026-07-25' } });

    expect(onCustomDateChange).toHaveBeenCalledWith('2026-07-25');
  });

  it('calls onStatusChange when the status select changes, using a custom label', async () => {
    const onStatusChange = vi.fn();
    render(
      createElement(QueueFilterBar, {
        dateRangePreset: 'today',
        onDateRangePresetChange: vi.fn(),
        customDate: '',
        onCustomDateChange: vi.fn(),
        statusValue: 'All',
        onStatusChange,
        statusOptions: [
          { value: 'All', label: 'All statuses' },
          { value: 'Ongoing', label: 'Ongoing' },
        ],
        statusLabel: 'Consultation status',
      })
    );

    expect(screen.getByText('Consultation status')).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText('Consultation status'),
      'Ongoing'
    );

    expect(onStatusChange).toHaveBeenCalledWith('Ongoing');
  });

  it('renders extra page-specific filters passed as children', () => {
    render(
      createElement(
        QueueFilterBar,
        {
          dateRangePreset: 'today',
          onDateRangePresetChange: vi.fn(),
          customDate: '',
          onCustomDateChange: vi.fn(),
          statusValue: 'All',
          onStatusChange: vi.fn(),
          statusOptions: [{ value: 'All', label: 'All statuses' }],
        },
        createElement('span', null, 'Extra filter slot')
      )
    );

    expect(screen.getByText('Extra filter slot')).toBeInTheDocument();
  });
});
