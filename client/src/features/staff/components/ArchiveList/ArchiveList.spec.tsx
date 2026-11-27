import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ArchiveList } from './ArchiveList';

interface Row {
  id: string;
  name: string;
  archived_at: string;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Alpha', archived_at: '2026-01-10T00:00:00.000Z' },
  { id: 'b', name: 'Bravo', archived_at: '2026-02-15T00:00:00.000Z' },
  { id: 'c', name: 'Charlie', archived_at: '2026-02-20T00:00:00.000Z' },
];

function setup(rows: Row[] = ROWS) {
  return render(
    <ArchiveList<Row>
      entityLabel="widgets"
      accessToken="token"
      fetchArchived={() => Promise.resolve({ data: rows, error: null })}
      restoreItem={() => Promise.resolve({ data: null, error: null })}
      hardDeleteItem={() => Promise.resolve({ data: null, error: null })}
      renderLabel={(item) => item.name}
    />
  );
}

describe('ArchiveList (generic search/sort/group/view controls)', () => {
  it('filters items by the search box, matching renderLabel text', async () => {
    setup();
    const user = userEvent.setup();

    await screen.findByText('Alpha');
    await user.type(
      screen.getByRole('searchbox', { name: /search archived widgets/i }),
      'bra'
    );

    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.queryByText('Charlie')).toBeNull();
  });

  it('sorts alphabetically when Name (Z-A) is picked', async () => {
    setup();
    const user = userEvent.setup();

    await screen.findByText('Alpha');
    await user.selectOptions(screen.getByLabelText('Sort'), 'name-desc');

    const labels = screen
      .getAllByText(/^(Alpha|Bravo|Charlie)$/)
      .map((el) => el.textContent);
    expect(labels).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('groups by archived month when Group by is set', async () => {
    setup();
    const user = userEvent.setup();

    await screen.findByText('Alpha');
    await user.selectOptions(screen.getByLabelText('Group by'), 'month');

    expect(
      screen.getByText(
        new Date('2026-01-10').toLocaleDateString([], {
          month: 'long',
          year: 'numeric',
        })
      )
    ).toBeInTheDocument();
  });

  it('switches to a table view, keeping Restore/Delete actions available', async () => {
    setup();
    const user = userEvent.setup();

    await screen.findByText('Alpha');
    await user.click(screen.getByRole('button', { name: 'Table' }));

    const table = screen.getByRole('table');
    expect(within(table).getByText('Alpha')).toBeInTheDocument();
    expect(
      within(table).getAllByRole('button', { name: 'Restore' })
    ).toHaveLength(3);
  });
});
