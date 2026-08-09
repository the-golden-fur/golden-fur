import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as hotelApi from '../../api/hotel.api';
import * as customerApi from '../../../customers/api/customer.api';
import { BoardingChecklistKanban } from './BoardingChecklistKanban';

vi.mock('../../api/hotel.api', () => ({
  getTodayCareLogEntries: vi.fn(),
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

describe('BoardingChecklistKanban', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customerApi.getPet).mockResolvedValue({
      data: { id: 'pet-1', name: 'Max' } as never,
      error: null,
    });
  });

  it('shows a task under its status column with the pet name, and only for the active Hotel/Daycare subtab', async () => {
    vi.mocked(hotelApi.getTodayCareLogEntries).mockResolvedValue({
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

  it('clicking the circular checkbox on a Pending task marks it complete', async () => {
    vi.mocked(hotelApi.getTodayCareLogEntries).mockResolvedValue({
      data: [buildEntry()],
      error: null,
    });
    vi.mocked(hotelApi.completeCareLogEntry).mockResolvedValue({
      data: buildEntry({ status: 'Completed', completed_at: 'now' }),
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    fireEvent.click(
      screen.getByRole('button', {
        name: /Mark complete: Morning meal/,
      })
    );

    await waitFor(() =>
      expect(hotelApi.completeCareLogEntry).toHaveBeenCalledWith(
        'entry-1',
        'token'
      )
    );
  });

  it('clicking the checkbox on a Completed task reopens it to Pending', async () => {
    vi.mocked(hotelApi.getTodayCareLogEntries).mockResolvedValue({
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

  it('the "Start" action on a Pending card moves it to In Progress', async () => {
    vi.mocked(hotelApi.getTodayCareLogEntries).mockResolvedValue({
      data: [buildEntry()],
      error: null,
    });
    vi.mocked(hotelApi.startCareLogEntry).mockResolvedValue({
      data: buildEntry({ status: 'In Progress' }),
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() =>
      expect(hotelApi.startCareLogEntry).toHaveBeenCalledWith(
        'entry-1',
        'token'
      )
    );
  });

  it('filters by search text matching the pet name', async () => {
    vi.mocked(hotelApi.getTodayCareLogEntries).mockResolvedValue({
      data: [buildEntry()],
      error: null,
    });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Search the Boarding Checklist'), {
      target: { value: 'Nobody' },
    });

    await waitFor(() =>
      expect(screen.queryByText('Max')).not.toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText('Search the Boarding Checklist'), {
      target: { value: 'max' },
    });

    await waitFor(() => expect(screen.getByText('Max')).toBeInTheDocument());
  });

  it('groups Pending-column cards by time-of-day when the toggle is on', async () => {
    vi.mocked(hotelApi.getTodayCareLogEntries).mockResolvedValue({
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
      expect(
        screen.getByText('Morning meal — 1 cup kibble')
      ).toBeInTheDocument()
    );
    expect(
      screen.getByRole('heading', { name: 'Morning', level: 3 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Evening', level: 3 })
    ).toBeInTheDocument();
  });
});
