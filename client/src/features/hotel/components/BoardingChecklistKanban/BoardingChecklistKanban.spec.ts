import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function renderBoard() {
  return render(
    createElement(BoardingChecklistKanban, { accessToken: 'token' })
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

    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Walking' },
    });

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
});
