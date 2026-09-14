import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { FilterSortBar } from './FilterSortBar';
import type {
  FilterField,
  FilterTile,
  FilterValue,
  SortFieldDescriptor,
  SortTile,
} from './filterField.types';

const FILTER_FIELDS: FilterField[] = [
  {
    id: 'status',
    label: 'Status',
    type: 'select',
    defaultValue: 'Pending',
    options: [
      { value: 'Pending', label: 'Due payment' },
      { value: 'Fully Paid', label: 'Fully Paid' },
    ],
    formatValue: (value) =>
      value === 'Fully Paid' ? 'Fully Paid' : 'Due payment',
  },
  {
    id: 'service',
    label: 'Service',
    type: 'select',
    defaultValue: 'Grooming',
    options: [
      { value: 'Grooming', label: 'Grooming' },
      { value: 'Hotel', label: 'Hotel' },
    ],
    formatValue: (value) => String(value ?? ''),
  },
];

const SORT_FIELDS: SortFieldDescriptor[] = [
  {
    id: 'date',
    label: 'Date',
    directions: [
      { value: 'desc', label: 'Newest first' },
      { value: 'asc', label: 'Oldest first' },
    ],
  },
];

function Harness() {
  const [filterTiles, setFilterTiles] = useState<FilterTile[]>([]);
  const [sortTile, setSortTile] = useState<SortTile | null>(null);

  return (
    <FilterSortBar
      filterFields={FILTER_FIELDS}
      filterTiles={filterTiles}
      onAddFilter={(fieldId) => {
        const field = FILTER_FIELDS.find((f) => f.id === fieldId);
        if (field) {
          setFilterTiles((prev) => [
            ...prev,
            { fieldId, value: field.defaultValue },
          ]);
        }
      }}
      onChangeFilter={(fieldId, value: FilterValue) =>
        setFilterTiles((prev) =>
          prev.map((tile) =>
            tile.fieldId === fieldId ? { ...tile, value } : tile
          )
        )
      }
      onRemoveFilter={(fieldId) =>
        setFilterTiles((prev) => prev.filter((t) => t.fieldId !== fieldId))
      }
      sortFields={SORT_FIELDS}
      sortTile={sortTile}
      onChangeSort={setSortTile}
    />
  );
}

describe('FilterSortBar', () => {
  it('adds a tile from the Filter menu, then disables that field in the menu', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Status' }));

    expect(
      screen.getByRole('button', { name: /Status: Due payment/ })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getByRole('menuitem', { name: 'Status' })).toBeDisabled();
  });

  it('edits a tile value from its popover', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Service' }));

    await userEvent.click(
      screen.getByRole('button', { name: /Service: Grooming/ })
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('option', { name: 'Hotel' })
    );

    expect(
      screen.getByRole('button', { name: /Service: Hotel/ })
    ).toBeInTheDocument();
  });

  it('removes a tile via its X button', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Status' }));

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Status filter' })
    );

    expect(
      screen.queryByRole('button', { name: /Status:/ })
    ).not.toBeInTheDocument();
  });

  it('sets and clears a sort tile', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Sort' }));
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Date · Newest first' })
    );

    expect(
      screen.getByRole('button', { name: /Sort: Date \(Newest first\)/ })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove sort' }));
    expect(
      screen.queryByRole('button', { name: /Sort:/ })
    ).not.toBeInTheDocument();
  });

  it('closes the Filter menu on Escape', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(
      screen.getByRole('menuitem', { name: 'Status' })
    ).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(
      screen.queryByRole('menuitem', { name: 'Status' })
    ).not.toBeInTheDocument();
  });
});
