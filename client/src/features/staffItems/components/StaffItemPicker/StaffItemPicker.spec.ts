import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StaffItemPicker } from './StaffItemPicker';
import type { PickableStaffFoodItem } from '../../staffItems.types';

const MINE: PickableStaffFoodItem = {
  id: 'food-1',
  owner_staff_id: 'staff-1',
  name: 'Dry kibble',
  quantity: '1',
  quantity_unit: 'cup',
  special_instructions: null,
  photo_url: null,
  is_public: false,
  archived_at: null,
  created_at: '',
  updated_at: '',
  owner_display_name: 'Jamie Cruz',
  is_mine: true,
};

const PUBLIC_ITEM: PickableStaffFoodItem = {
  ...MINE,
  id: 'food-2',
  owner_staff_id: 'staff-2',
  name: 'Salmon oil',
  is_public: true,
  owner_display_name: 'Pat Reyes',
  is_mine: false,
};

describe('StaffItemPicker', () => {
  it('groups items into "My items" and "Public items" optgroups', () => {
    render(
      createElement(StaffItemPicker, {
        items: [MINE, PUBLIC_ITEM],
        onPick: vi.fn(),
        placeholder: 'Add from library...',
        'aria-label': 'Add feeding time from library',
      })
    );

    const select = screen.getByRole('combobox', {
      name: 'Add feeding time from library',
    });
    const groups = select.querySelectorAll('optgroup');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveAttribute('label', 'My items');
    expect(groups[1]).toHaveAttribute('label', 'Public items');
    expect(screen.getByText('Dry kibble')).toBeInTheDocument();
    expect(screen.getByText('Salmon oil — Pat Reyes')).toBeInTheDocument();
  });

  it('picking an option fires onPick with the full item and resets to the placeholder', () => {
    const onPick = vi.fn();
    render(
      createElement(StaffItemPicker, {
        items: [MINE, PUBLIC_ITEM],
        onPick,
        placeholder: 'Add from library...',
        'aria-label': 'Add feeding time from library',
      })
    );

    const select = screen.getByRole('combobox', {
      name: 'Add feeding time from library',
    }) as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'food-2' } });

    expect(onPick).toHaveBeenCalledWith(PUBLIC_ITEM);
    expect(select.value).toBe('');
  });

  it('renders only the placeholder when there are no items', () => {
    render(
      createElement(StaffItemPicker, {
        items: [],
        onPick: vi.fn(),
        placeholder: 'Add from library...',
        'aria-label': 'Add feeding time from library',
      })
    );

    const select = screen.getByRole('combobox', {
      name: 'Add feeding time from library',
    });
    expect(select.querySelectorAll('optgroup')).toHaveLength(0);
    expect(screen.getByText('Add from library...')).toBeInTheDocument();
  });
});
