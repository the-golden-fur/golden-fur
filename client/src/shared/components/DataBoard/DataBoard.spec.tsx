import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('DataBoard column drag-to-reorder', () => {
  function fakeDataTransfer() {
    return { effectAllowed: '' };
  }

  it('column headers are not draggable when onReorderColumn is omitted', () => {
    render(
      <DataBoard
        groups={GROUPS}
        getRowKey={(cage) => cage.id}
        renderCard={(cage) => <span>{cage.label}</span>}
      />
    );

    const header = screen.getByRole('heading', { name: /Available/ });
    expect(header).toHaveAttribute('draggable', 'false');
  });

  it('column headers become drag handles when onReorderColumn is provided', () => {
    render(
      <DataBoard
        groups={GROUPS}
        getRowKey={(cage) => cage.id}
        renderCard={(cage) => <span>{cage.label}</span>}
        onReorderColumn={vi.fn()}
      />
    );

    const header = screen.getByRole('heading', { name: /Available/ });
    expect(header).toHaveAttribute('draggable', 'true');
  });

  it('dragging one column header onto another calls onReorderColumn(dragged, target)', () => {
    const onReorderColumn = vi.fn();
    render(
      <DataBoard
        groups={GROUPS}
        getRowKey={(cage) => cage.id}
        renderCard={(cage) => <span>{cage.label}</span>}
        onReorderColumn={onReorderColumn}
      />
    );

    const availableHeader = screen.getByRole('heading', {
      name: /Available/,
    });
    const occupiedColumn = screen
      .getByRole('heading', { name: /Occupied/ })
      .closest('section') as HTMLElement;

    fireEvent.dragStart(availableHeader, { dataTransfer: fakeDataTransfer() });
    fireEvent.dragOver(occupiedColumn);
    fireEvent.drop(occupiedColumn);

    expect(onReorderColumn).toHaveBeenCalledWith('Available', 'Occupied');
  });

  it('dropping a column onto itself does not call onReorderColumn', () => {
    const onReorderColumn = vi.fn();
    render(
      <DataBoard
        groups={GROUPS}
        getRowKey={(cage) => cage.id}
        renderCard={(cage) => <span>{cage.label}</span>}
        onReorderColumn={onReorderColumn}
      />
    );

    const availableHeader = screen.getByRole('heading', {
      name: /Available/,
    });
    const availableColumn = availableHeader.closest('section') as HTMLElement;

    fireEvent.dragStart(availableHeader, { dataTransfer: fakeDataTransfer() });
    fireEvent.dragOver(availableColumn);
    fireEvent.drop(availableColumn);

    expect(onReorderColumn).not.toHaveBeenCalled();
  });
});
