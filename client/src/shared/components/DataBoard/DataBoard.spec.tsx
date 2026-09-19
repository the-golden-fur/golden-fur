import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataBoard } from './DataBoard';
import type { GroupByBucket } from '../../hooks/useGroupBy/useGroupBy';

interface Cage {
  id: string;
  label: string;
}

const GROUPS: GroupByBucket<Cage>[] = [
  { column: 'Available', items: [{ id: '1', label: 'Cage A' }] },
  { column: 'Occupied', items: [] },
];

describe('DataBoard', () => {
  it('renders one column per group, with a default header showing the count', () => {
    render(
      <DataBoard
        groups={GROUPS}
        getRowKey={(cage) => cage.id}
        renderCard={(cage) => <span>{cage.label}</span>}
      />
    );

    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Occupied')).toBeInTheDocument();
    expect(screen.getByText('Cage A')).toBeInTheDocument();
  });

  it('shows the empty-column message for a group with no items', () => {
    render(
      <DataBoard
        groups={GROUPS}
        getRowKey={(cage) => cage.id}
        renderCard={(cage) => <span>{cage.label}</span>}
        emptyColumnMessage="No cages in this state."
      />
    );

    expect(screen.getByText('No cages in this state.')).toBeInTheDocument();
  });

  it('uses a custom column header renderer when provided', () => {
    render(
      <DataBoard
        groups={GROUPS}
        getRowKey={(cage) => cage.id}
        renderCard={(cage) => <span>{cage.label}</span>}
        renderColumnHeader={(column, count) => (
          <span>{`${column} (${count})`}</span>
        )}
      />
    );

    expect(screen.getByText('Available (1)')).toBeInTheDocument();
    expect(screen.getByText('Occupied (0)')).toBeInTheDocument();
  });

  it('does not render items from one column inside another', () => {
    const { container } = render(
      <DataBoard
        groups={GROUPS}
        getRowKey={(cage) => cage.id}
        renderCard={(cage) => (
          <span data-testid={`card-${cage.id}`}>{cage.label}</span>
        )}
      />
    );

    const columns = container.querySelectorAll('section');
    expect(
      within(columns[0] as HTMLElement).getByTestId('card-1')
    ).toBeInTheDocument();
    expect(
      within(columns[1] as HTMLElement).queryByTestId('card-1')
    ).not.toBeInTheDocument();
  });
});
