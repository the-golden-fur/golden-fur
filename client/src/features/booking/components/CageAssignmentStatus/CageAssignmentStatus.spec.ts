import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CageAssignmentStatus } from './CageAssignmentStatus';
import * as bookingApi from '../../api/booking.api';
import { ToastProvider } from '../../../../shared/providers/ToastProvider/ToastProvider';

vi.mock('../../api/booking.api', () => ({
  getCageAssignmentStatus: vi.fn(),
}));

const PROPS = {
  accessToken: 'token',
  branchId: 'branch-1',
  petId: 'pet-1',
  petName: 'Luna',
};

function renderWithToast(props: Record<string, unknown>) {
  return render(
    createElement(
      ToastProvider,
      null,
      createElement(CageAssignmentStatus, props)
    )
  );
}

describe('CageAssignmentStatus', () => {
  it('shows a matched banner naming the cage when one is available', async () => {
    vi.mocked(bookingApi.getCageAssignmentStatus).mockResolvedValue({
      data: {
        matched: true,
        cage: { id: 'cage-1', cage_label: 'Makati-S-01' },
      },
      error: null,
    });

    renderWithToast(PROPS);

    await waitFor(() =>
      expect(
        screen.getByText(/A cage is available for Luna/)
      ).toBeInTheDocument()
    );
    expect(screen.getByText(/Makati-S-01/)).toBeInTheDocument();
  });

  it('shows a no-cage-available toast when nothing matches, instead of a persistent inline banner', async () => {
    vi.mocked(bookingApi.getCageAssignmentStatus).mockResolvedValue({
      data: { matched: false, cage: null },
      error: null,
    });

    renderWithToast(PROPS);

    await waitFor(() =>
      expect(
        screen.getByText(/No cage is currently available for Luna/)
      ).toBeInTheDocument()
    );
    // It's a toast (role="status" in the app-wide stack), not the old
    // persistent role="alert" banner under the component itself.
    expect(screen.getByRole('status')).toHaveTextContent(
      /No cage is currently available for Luna/
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('surfaces an error message when the request fails', async () => {
    vi.mocked(bookingApi.getCageAssignmentStatus).mockResolvedValue({
      data: null,
      error: 'Request failed. Please try again.',
    });

    renderWithToast(PROPS);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Request failed. Please try again.'
      )
    );
  });

  it('fetches with only accessToken/branchId/petId - date/slot is optional', async () => {
    vi.mocked(bookingApi.getCageAssignmentStatus).mockResolvedValue({
      data: { matched: true, cage: null },
      error: null,
    });

    renderWithToast(PROPS);

    await waitFor(() =>
      expect(bookingApi.getCageAssignmentStatus).toHaveBeenCalledWith(
        'token',
        'branch-1',
        'pet-1'
      )
    );
  });

  it('re-fires a fresh toast when scheduledStart changes (e.g. the customer picks a different date)', async () => {
    vi.mocked(bookingApi.getCageAssignmentStatus).mockResolvedValue({
      data: { matched: false, cage: null },
      error: null,
    });

    const { rerender } = renderWithToast({
      ...PROPS,
      scheduledStart: '2026-08-05T13:00:00.000Z',
    });

    await waitFor(() =>
      expect(bookingApi.getCageAssignmentStatus).toHaveBeenCalledTimes(1)
    );

    rerender(
      createElement(
        ToastProvider,
        null,
        createElement(CageAssignmentStatus, {
          ...PROPS,
          scheduledStart: '2026-08-06T13:00:00.000Z',
        })
      )
    );

    await waitFor(() =>
      expect(bookingApi.getCageAssignmentStatus).toHaveBeenCalledTimes(2)
    );
  });
});
