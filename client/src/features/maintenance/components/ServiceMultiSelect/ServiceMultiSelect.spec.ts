import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ServiceMultiSelect } from './ServiceMultiSelect';

const OPTIONS = [
  { id: 'service-1', label: 'Bath', sublabel: 'Grooming - PHP 300.00' },
  { id: 'service-2', label: 'Blow-dry' },
  { id: 'service-3', label: 'Brushing' },
];

describe('ServiceMultiSelect', () => {
  it('renders one checkbox per option with any sublabel', () => {
    render(
      createElement(ServiceMultiSelect, {
        label: 'Included services',
        options: OPTIONS,
        selectedIds: ['service-2'],
        onChange: vi.fn(),
      })
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByText('Grooming - PHP 300.00')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Blow-dry/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Bath/ })).not.toBeChecked();
  });

  it('emits selected ids in option order when checking', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(ServiceMultiSelect, {
        label: 'Included services',
        options: OPTIONS,
        selectedIds: ['service-3'],
        onChange,
      })
    );

    await user.click(screen.getByRole('checkbox', { name: /Bath/ }));

    expect(onChange).toHaveBeenCalledWith(['service-1', 'service-3']);
  });

  it('emits without the id when unchecking', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(ServiceMultiSelect, {
        label: 'Included services',
        options: OPTIONS,
        selectedIds: ['service-1', 'service-3'],
        onChange,
      })
    );

    await user.click(screen.getByRole('checkbox', { name: /Brushing/ }));

    expect(onChange).toHaveBeenCalledWith(['service-1']);
  });

  it('renders an empty state when there are no options', () => {
    render(
      createElement(ServiceMultiSelect, {
        label: 'Included services',
        options: [],
        selectedIds: [],
        onChange: vi.fn(),
      })
    );

    expect(screen.getByText('No options available.')).toBeInTheDocument();
  });
});
