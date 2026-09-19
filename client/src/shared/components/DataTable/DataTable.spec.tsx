import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from './DataTable';

interface Row {
  id: string;
  name: string;
  price: number;
}

const ROWS: Row[] = [
  { id: '1', name: 'Bath', price: 300 },
  { id: '2', name: 'Trim', price: 500 },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Name', render: (row) => row.name },
  {
    id: 'price',
    header: 'Price',
    align: 'end',
    render: (row) => `₱${row.price}`,
  },
];

describe('DataTable', () => {
  it('renders one header per column and one row per item', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} getRowKey={(r) => r.id} />);

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Price' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Bath' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '₱500' })).toBeInTheDocument();
  });

  it('renders row actions in a trailing column when provided', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        getRowKey={(r) => r.id}
        renderRowActions={(row) => <button>Edit {row.name}</button>}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Edit Bath' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit Trim' })
    ).toBeInTheDocument();
  });

  it('shows the empty message instead of a table when there are no rows', () => {
    render(<DataTable columns={COLUMNS} rows={[]} getRowKey={(r) => r.id} emptyMessage="No services yet." />);

    expect(screen.getByText('No services yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('calls getRowKey and render for every row', () => {
    const getRowKey = vi.fn((row: Row) => row.id);
    render(<DataTable columns={COLUMNS} rows={ROWS} getRowKey={getRowKey} />);
    expect(getRowKey).toHaveBeenCalledTimes(ROWS.length);
  });
});
