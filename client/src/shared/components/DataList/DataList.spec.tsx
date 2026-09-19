import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataList } from './DataList';

interface Item {
  id: string;
  label: string;
}

const ITEMS: Item[] = [
  { id: '1', label: 'Small cage' },
  { id: '2', label: 'Large cage' },
];

describe('DataList', () => {
  it('renders one list item per entry', () => {
    render(
      <DataList
        items={ITEMS}
        getRowKey={(item) => item.id}
        renderItem={(item) => <span>{item.label}</span>}
      />
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Small cage')).toBeInTheDocument();
    expect(screen.getByText('Large cage')).toBeInTheDocument();
  });

  it('shows the empty message instead of a list when there are no items', () => {
    render(
      <DataList
        items={[]}
        getRowKey={(item: Item) => item.id}
        renderItem={(item) => <span>{item.label}</span>}
        emptyMessage="No cages at this branch yet."
      />
    );

    expect(screen.getByText('No cages at this branch yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
