import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as recordsArchiveApi from '../../api/recordsArchive.api';
import type { DeletedRecordArchiveEntry } from '../../staff.types';
import { DeletedRecordsArchiveList } from './DeletedRecordsArchiveList';

vi.mock('../../api/recordsArchive.api', () => ({
  listDeletedRecordTables: vi.fn(),
  listDeletedRecords: vi.fn(),
  restoreDeletedRecord: vi.fn(),
  purgeDeletedRecord: vi.fn(),
}));

function buildEntry(
  overrides: Partial<DeletedRecordArchiveEntry> = {}
): DeletedRecordArchiveEntry {
  return {
    id: 'archive-1',
    source_table: 'pets',
    record_id: 'pet-1',
    row_data: { id: 'pet-1', name: 'Buddy' },
    deleted_by: null,
    deleted_at: '2026-09-14T00:00:00.000Z',
    restored_at: null,
    restored_by: null,
    ...overrides,
  };
}

function stubDefaults() {
  vi.mocked(recordsArchiveApi.listDeletedRecordTables).mockResolvedValue({
    data: ['bookings', 'pets'],
    error: null,
  });
  vi.mocked(recordsArchiveApi.listDeletedRecords).mockResolvedValue({
    data: { rows: [buildEntry()], total: 1 },
    error: null,
  });
}

function renderList() {
  return render(
    createElement(DeletedRecordsArchiveList, { accessToken: 'token' })
  );
}

describe('DeletedRecordsArchiveList', () => {
  it('loads and renders a deleted record row', async () => {
    stubDefaults();

    renderList();

    const recordId = await screen.findByText('pet-1');
    expect(recordId).toBeInTheDocument();
    expect(
      within(recordId.closest('li')!).getByText('pets')
    ).toBeInTheDocument();
  });

  it('filtering by table re-fetches with the table param and resets to page 1', async () => {
    stubDefaults();

    const user = userEvent.setup();
    renderList();

    await screen.findByText('pet-1');

    await user.selectOptions(screen.getByLabelText('Table'), 'bookings');

    await waitFor(() =>
      expect(recordsArchiveApi.listDeletedRecords).toHaveBeenLastCalledWith(
        'token',
        expect.objectContaining({ table: 'bookings', page: 1 })
      )
    );
  });

  it('typing in search re-fetches with the search param', async () => {
    stubDefaults();

    const user = userEvent.setup();
    renderList();

    await screen.findByText('pet-1');
    await user.type(screen.getByLabelText('Search'), 'Buddy');

    await waitFor(() =>
      expect(recordsArchiveApi.listDeletedRecords).toHaveBeenLastCalledWith(
        'token',
        expect.objectContaining({ search: 'Buddy' })
      )
    );
  });

  it('View details toggles the JSON preview of the deleted row', async () => {
    stubDefaults();

    const user = userEvent.setup();
    renderList();

    await screen.findByText('pet-1');
    await user.click(screen.getByText('View details'));

    expect(screen.getByText(/"name": "Buddy"/)).toBeInTheDocument();

    await user.click(screen.getByText('Hide details'));
    expect(screen.queryByText(/"name": "Buddy"/)).not.toBeInTheDocument();
  });

  it('restoring a record disables its Restore button once restored', async () => {
    stubDefaults();
    vi.mocked(recordsArchiveApi.restoreDeletedRecord).mockResolvedValue({
      data: buildEntry({ restored_at: '2026-09-14T01:00:00.000Z' }),
      error: null,
    });

    const user = userEvent.setup();
    renderList();

    await screen.findByText('pet-1');
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    expect(
      await screen.findByRole('button', { name: 'Restore' })
    ).toBeDisabled();
  });

  it('shows a row error when restore fails', async () => {
    stubDefaults();
    vi.mocked(recordsArchiveApi.restoreDeletedRecord).mockResolvedValue({
      data: null,
      error: 'Could not restore into pets: duplicate key',
    });

    const user = userEvent.setup();
    renderList();

    await screen.findByText('pet-1');
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    expect(
      await screen.findByText('Could not restore into pets: duplicate key')
    ).toBeInTheDocument();
  });

  it('deleting permanently requires confirmation, then removes the row', async () => {
    stubDefaults();
    vi.mocked(recordsArchiveApi.purgeDeletedRecord).mockResolvedValue({
      data: null,
      error: null,
    });

    const user = userEvent.setup();
    renderList();

    await screen.findByText('pet-1');
    await user.click(screen.getByText('Delete permanently'));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Permanently delete this archive entry?')
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: 'Delete permanently' })
    );

    await waitFor(() =>
      expect(recordsArchiveApi.purgeDeletedRecord).toHaveBeenCalledWith(
        'token',
        'archive-1'
      )
    );
    expect(screen.queryByText('pet-1')).not.toBeInTheDocument();
  });

  it('shows an error state when the initial load fails', async () => {
    vi.mocked(recordsArchiveApi.listDeletedRecordTables).mockResolvedValue({
      data: [],
      error: null,
    });
    vi.mocked(recordsArchiveApi.listDeletedRecords).mockResolvedValue({
      data: null,
      error: 'Could not load the deleted records archive.',
    });

    renderList();

    expect(
      await screen.findByText('Could not load the deleted records archive.')
    ).toBeInTheDocument();
  });
});
