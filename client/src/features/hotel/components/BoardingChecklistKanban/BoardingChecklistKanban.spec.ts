import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as hotelApi from '../../api/hotel.api';
import * as customerApi from '../../../customers/api/customer.api';
import { BoardingChecklistKanban } from './BoardingChecklistKanban';

vi.mock('../../api/hotel.api', () => ({
  getCareLogEntries: vi.fn(),
  completeCareLogEntry: vi.fn(),
  reopenCareLogEntry: vi.fn(),
  startCareLogEntry: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
}));

function buildEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'entry-1',
    stay_id: 'stay-1',
    care_type: 'Feeding',
    scheduled_date: '2026-08-09',
    description: 'Morning meal — 1 cup kibble',
    time_block: 'Morning',
    status: 'Pending',
    completed_at: null,
    completed_by: null,
    created_at: '',
    stays: { stay_type: 'Hotel', pet_id: 'pet-1' },
    ...overrides,
  };
}

function renderBoard(
  props: Partial<Parameters<typeof BoardingChecklistKanban>[0]> = {}
) {
  return render(
    createElement(BoardingChecklistKanban, { accessToken: 'token', ...props })
  );
}

const SEARCH_PLACEHOLDER = 'Search by pet name or task...';

describe('BoardingChecklistKanban', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customerApi.getPet).mockResolvedValue({
      data: { id: 'pet-1', name: 'Max' } as never,
      error: null,
    });
  });

  it('shows a task under its status column with the pet name, and only for the active Hotel/Daycare subtab', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [
        buildEntry({ id: 'hotel-1', description: 'Hotel task' }),
        buildEntry({
          id: 'daycare-1',
          description: 'Daycare task',
          stays: { stay_type: 'Daycare', pet_id: 'pet-1' },
        }),
      ],
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    expect(screen.getByText('Hotel task')).toBeInTheDocument();
    expect(screen.queryByText('Daycare task')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Daycare' }));
    await waitFor(() =>
      expect(screen.getByText('Daycare task')).toBeInTheDocument()
    );
    expect(screen.queryByText('Hotel task')).not.toBeInTheDocument();
  });

  it('renders a 4th Missed column alongside Pending/In Progress/Completed by default (grouped by status)', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [buildEntry()],
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    expect(
      screen.getByRole('heading', { name: /^Pending/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /^In Progress/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /^Completed/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /^Missed/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /^Backlog/ })
    ).toBeInTheDocument();
  });

  it('Custom change (Backlog status): a Backlog card has a disabled checkbox and cannot be acted on', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [buildEntry({ status: 'Backlog' })],
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    const checkbox = screen.getByRole('button', {
      name: /Not due yet \(read-only\)/,
    });
    expect(checkbox).toBeDisabled();

    fireEvent.click(checkbox);
    expect(hotelApi.startCareLogEntry).not.toHaveBeenCalled();
    expect(hotelApi.completeCareLogEntry).not.toHaveBeenCalled();
    expect(hotelApi.reopenCareLogEntry).not.toHaveBeenCalled();
  });

  it('a Missed card has a disabled checkbox and cannot be acted on', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [buildEntry({ status: 'Missed' })],
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    const checkbox = screen.getByRole('button', {
      name: /Missed \(read-only\)/,
    });
    expect(checkbox).toBeDisabled();

    fireEvent.click(checkbox);
    expect(hotelApi.startCareLogEntry).not.toHaveBeenCalled();
    expect(hotelApi.completeCareLogEntry).not.toHaveBeenCalled();
    expect(hotelApi.reopenCareLogEntry).not.toHaveBeenCalled();
  });

  it('clicking the checkbox on a Pending task starts it (advances to In Progress), not straight to Completed', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [buildEntry()],
      error: null,
    });
    vi.mocked(hotelApi.startCareLogEntry).mockResolvedValue({
      data: buildEntry({ status: 'In Progress' }),
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    fireEvent.click(
      screen.getByRole('button', { name: /Start: Morning meal/ })
    );

    await waitFor(() =>
      expect(hotelApi.startCareLogEntry).toHaveBeenCalledWith(
        'entry-1',
        'token'
      )
    );
    expect(hotelApi.completeCareLogEntry).not.toHaveBeenCalled();
  });

  it('clicking the checkbox on an In Progress task marks it complete', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [buildEntry({ status: 'In Progress' })],
      error: null,
    });
    vi.mocked(hotelApi.completeCareLogEntry).mockResolvedValue({
      data: buildEntry({ status: 'Completed', completed_at: 'now' }),
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    fireEvent.click(
      screen.getByRole('button', { name: /Mark complete: Morning meal/ })
    );

    await waitFor(() =>
      expect(hotelApi.completeCareLogEntry).toHaveBeenCalledWith(
        'entry-1',
        'token'
      )
    );
  });

  it('clicking the checkbox on a Completed task reopens it straight to Pending', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [
        buildEntry({
          status: 'Completed',
          completed_at: '2026-08-09T00:00:00Z',
        }),
      ],
      error: null,
    });
    vi.mocked(hotelApi.reopenCareLogEntry).mockResolvedValue({
      data: buildEntry({ status: 'Pending' }),
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    fireEvent.click(
      screen.getByRole('button', { name: /Reopen: Morning meal/ })
    );

    await waitFor(() =>
      expect(hotelApi.reopenCareLogEntry).toHaveBeenCalledWith(
        'entry-1',
        'token'
      )
    );
  });

  it('regression: a mutation response missing the stays join no longer drops the task from the list (merges instead of replacing)', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [buildEntry()],
      error: null,
    });
    // Simulates a server response shaped like the pre-fix mutation
    // endpoints - no `stays` field at all.
    vi.mocked(hotelApi.startCareLogEntry).mockResolvedValue({
      data: {
        id: 'entry-1',
        status: 'In Progress',
      } as never,
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    fireEvent.click(
      screen.getByRole('button', { name: /Start: Morning meal/ })
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /^In Progress/ })
      ).toBeInTheDocument()
    );
    // Still visible under the Hotel tab - not silently filtered out because
    // the merged entry kept its original `stays` field.
    expect(screen.getByText('Max')).toBeInTheDocument();
    expect(screen.getByText('Morning meal')).toBeInTheDocument();
  });

  it('splits the description into a title line and a detail line (e.g. the exact time)', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [
        buildEntry({
          care_type: 'Medication',
          description: 'Amoxicillin 250mg 1 — 8:00 AM',
        }),
      ],
      error: null,
    });

    renderBoard();

    await waitFor(() =>
      expect(screen.getByText('Amoxicillin 250mg 1')).toBeInTheDocument()
    );
    expect(screen.getByText('8:00 AM')).toBeInTheDocument();
  });

  it('clicking a task expands its details, and clicking again collapses them', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [buildEntry()],
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    expect(screen.queryByText(/Scheduled:/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Morning meal'));
    await waitFor(() =>
      expect(screen.getByText(/Scheduled:/)).toBeInTheDocument()
    );

    fireEvent.click(screen.getByText('Morning meal'));
    await waitFor(() =>
      expect(screen.queryByText(/Scheduled:/)).not.toBeInTheDocument()
    );
  });

  it('filters by search text matching the pet name', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [buildEntry()],
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), {
      target: { value: 'Nobody' },
    });

    await waitFor(() =>
      expect(screen.queryByText('Max')).not.toBeInTheDocument()
    );

    fireEvent.change(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), {
      target: { value: 'max' },
    });

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
  });

  it('filters by care-type category', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [
        buildEntry({ id: 'entry-feeding', description: 'Feeding task' }),
        buildEntry({
          id: 'entry-walking',
          description: 'Walking task',
          care_type: 'Walking',
        }),
      ],
      error: null,
    });

    renderBoard();

    await waitFor(() =>
      expect(screen.getByText('Feeding task')).toBeInTheDocument()
    );
    expect(screen.getByText('Walking task')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Category' }));
    fireEvent.click(screen.getByRole('button', { name: /Category: Any/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Walking' }));

    await waitFor(() =>
      expect(screen.queryByText('Feeding task')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Walking task')).toBeInTheDocument();
  });

  it('Group by: Time of day replaces the status columns with time-block columns', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [
        buildEntry({ id: 'entry-morning', time_block: 'Morning' }),
        buildEntry({
          id: 'entry-evening',
          time_block: 'Evening',
          description: 'Evening walk — 15 min',
          care_type: 'Walking',
        }),
      ],
      error: null,
    });

    renderBoard();

    await waitFor(() =>
      expect(screen.getAllByText('Max').length).toBeGreaterThan(0)
    );
    expect(
      screen.queryByRole('heading', { name: /^Pending/ })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Group by'), {
      target: { value: 'time' },
    });

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /^Morning/ })
      ).toBeInTheDocument()
    );
    expect(
      screen.getByRole('heading', { name: /^Evening/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /^Pending/ })
    ).not.toBeInTheDocument();
  });

  it('Group by: Instructions (category) replaces the status columns with category columns', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [
        buildEntry({ care_type: 'Feeding' }),
        buildEntry({
          id: 'entry-2',
          care_type: 'Medication',
          description: 'Amoxicillin 250mg 1 — 8:00 AM',
        }),
      ],
      error: null,
    });

    renderBoard();

    await waitFor(() =>
      expect(screen.getAllByText('Max').length).toBeGreaterThan(0)
    );

    fireEvent.change(screen.getByLabelText('Group by'), {
      target: { value: 'category' },
    });

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /^Feeding/ })
      ).toBeInTheDocument()
    );
    expect(
      screen.getByRole('heading', { name: /^Medication/ })
    ).toBeInTheDocument();
  });

  it('requests an explicit date range for "today" and only refetches when the Date tile changes', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [buildEntry()],
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    expect(hotelApi.getCareLogEntries).toHaveBeenCalledTimes(1);
    const [, firstParams] = vi.mocked(hotelApi.getCareLogEntries).mock.calls[0];
    expect(firstParams?.dateFrom).toBe(firstParams?.dateTo);

    // A client-side tile (Status) must not hit the server again.
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Status' }));
    expect(hotelApi.getCareLogEntries).toHaveBeenCalledTimes(1);

    // Removing the Date tile = all dates, which the server only honors with
    // an explicit lower bound (no bounds at all means "today" there).
    fireEvent.click(screen.getByRole('button', { name: 'Remove Date filter' }));
    await waitFor(() =>
      expect(hotelApi.getCareLogEntries).toHaveBeenCalledTimes(2)
    );
    expect(vi.mocked(hotelApi.getCareLogEntries).mock.calls[1][1]).toEqual({
      dateFrom: '2000-01-01',
    });
  });

  it('Table and List views show a "..." menu on every row', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [
        buildEntry(),
        buildEntry({ id: 'entry-2', description: 'Evening walk — 15 min' }),
      ],
      error: null,
    });

    renderBoard({ onOpenBooking: vi.fn() });

    await waitFor(() =>
      expect(screen.getAllByText('Max').length).toBeGreaterThan(0)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /^Actions for Max/ })
    ).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const triggers = screen.getAllByRole('button', {
      name: /^Actions for Max/,
    });
    expect(triggers).toHaveLength(2);

    fireEvent.click(triggers[0]);
    const menu = screen.getByRole('menu');
    expect(
      within(menu).getByRole('menuitem', { name: 'Start' })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Show details' })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Open this booking' })
    ).toBeInTheDocument();
  });

  it('Board cards have no "..." button; right-click opens the menu, whose status action matches the checkbox', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [buildEntry({ status: 'In Progress' })],
      error: null,
    });
    vi.mocked(hotelApi.completeCareLogEntry).mockResolvedValue({
      data: buildEntry({ status: 'Completed' }) as never,
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: /^Actions for/ })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Max'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark complete' }));

    await waitFor(() =>
      expect(hotelApi.completeCareLogEntry).toHaveBeenCalledWith(
        'entry-1',
        'token'
      )
    );
  });

  it('a read-only (Missed) task offers no status action in its menu', async () => {
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [buildEntry({ status: 'Missed' })],
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Gallery' }));
    fireEvent.contextMenu(screen.getByText('Max'));

    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
    expect(
      within(menu).getByRole('menuitem', { name: 'Show details' })
    ).toBeInTheDocument();
  });

  it('"Open this booking" reports the task\'s stay id', async () => {
    const onOpenBooking = vi.fn();
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [buildEntry({ stay_id: 'stay-42' })],
      error: null,
    });

    renderBoard({ onOpenBooking });

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    fireEvent.contextMenu(screen.getByText('Max'));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Open this booking' })
    );

    expect(onOpenBooking).toHaveBeenCalledWith('stay-42');
  });

  it("with a stayId: shows only that stay's tasks, across all dates, with no tabs or Date tile", async () => {
    const onOpenBooking = vi.fn();
    vi.mocked(hotelApi.getCareLogEntries).mockResolvedValue({
      data: [
        buildEntry({ id: 'mine', stay_id: 'stay-1', description: 'Mine' }),
        buildEntry({ id: 'other', stay_id: 'stay-2', description: 'Other' }),
        buildEntry({
          id: 'mine-later',
          stay_id: 'stay-1',
          description: 'Mine later',
          scheduled_date: '2026-08-12',
        }),
      ],
      error: null,
    });

    renderBoard({ stayId: 'stay-1', onOpenBooking });

    await waitFor(() => expect(screen.getByText('Mine')).toBeInTheDocument());
    expect(screen.getByText('Mine later')).toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Date:/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Showing only Max's Hotel booking")
    ).toBeInTheDocument();
    expect(hotelApi.getCareLogEntries).toHaveBeenCalledWith('token', {
      dateFrom: '2000-01-01',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show all bookings' }));
    expect(onOpenBooking).toHaveBeenCalledWith(null);
  });
});
