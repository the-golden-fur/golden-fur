import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useRenameAndArchive } from './useRenameAndArchive';

interface Row {
  id: string;
  name: string;
}

function Harness({
  onRename,
  onArchive,
  onArchiveError,
}: {
  onRename: (row: Row, name: string) => Promise<string | null>;
  onArchive: (row: Row) => Promise<string | null>;
  onArchiveError?: (message: string) => void;
}) {
  const row: Row = { id: 'r1', name: 'Bath' };
  const { requestRename, requestArchive, dialogs } = useRenameAndArchive<Row>({
    entityLabel: 'service',
    getName: (item) => item.name,
    onRename,
    onArchive,
    onArchiveError,
    archiveConsequence: 'it will be hidden from booking',
  });

  return (
    <div>
      <button type="button" onClick={() => requestRename(row)}>
        open rename
      </button>
      <button type="button" onClick={() => requestArchive(row)}>
        open archive
      </button>
      {dialogs}
    </div>
  );
}

describe('useRenameAndArchive', () => {
  it('renames through the Rename pop-up and closes it on success', async () => {
    const onRename = vi.fn().mockResolvedValue(null);
    render(<Harness onRename={onRename} onArchive={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'open rename' }));

    const input = screen.getByRole('textbox', { name: /new service name/i });
    expect(input).toHaveValue('Bath');
    await userEvent.clear(input);
    await userEvent.type(input, 'Deluxe Bath');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onRename).toHaveBeenCalledWith(
        { id: 'r1', name: 'Bath' },
        'Deluxe Bath'
      )
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('asks for confirmation before archiving, and does nothing on Cancel', async () => {
    const onArchive = vi.fn().mockResolvedValue(null);
    render(<Harness onRename={vi.fn()} onArchive={onArchive} />);

    await userEvent.click(screen.getByRole('button', { name: 'open archive' }));

    expect(
      screen.getByText(/"Bath" will be archived - it will be hidden/)
    ).toBeInTheDocument();
    expect(onArchive).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onArchive).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('archives on confirm and closes the dialog', async () => {
    const onArchive = vi.fn().mockResolvedValue(null);
    render(<Harness onRename={vi.fn()} onArchive={onArchive} />);

    await userEvent.click(screen.getByRole('button', { name: 'open archive' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(onArchive).toHaveBeenCalledWith({ id: 'r1', name: 'Bath' })
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('reports an archive failure through onArchiveError and closes the dialog', async () => {
    const onArchiveError = vi.fn();
    render(
      <Harness
        onRename={vi.fn()}
        onArchive={vi.fn().mockResolvedValue('Still used by a package')}
        onArchiveError={onArchiveError}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'open archive' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(onArchiveError).toHaveBeenCalledWith('Still used by a package')
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
