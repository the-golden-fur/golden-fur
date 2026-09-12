import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CageAssignmentStatus } from './CageAssignmentStatus';
import * as bookingApi from '../../api/booking.api';

vi.mock('../../api/booking.api', () => ({
  getCageAssignmentStatus: vi.fn(),
}));

const PROPS = {
  accessToken: 'token',
  branchId: 'branch-1',
  petId: 'pet-1',
  petName: 'Luna',
};

describe('CageAssignmentStatus', () => {
  it('shows a matched banner naming the cage when one is available', async () => {
    vi.mocked(bookingApi.getCageAssignmentStatus).mockResolvedValue({
      data: {
        matched: true,
        cage: { id: 'cage-1', cage_label: 'Makati-S-01' },
      },
      error: null,
    });

    render(createElement(CageAssignmentStatus, PROPS));

    await waitFor(() =>
      expect(
        screen.getByText(/A cage is available for Luna/)
      ).toBeInTheDocument()
    );
    expect(screen.getByText(/Makati-S-01/)).toBeInTheDocument();
  });

  it('shows a no-cage-available warning when nothing matches', async () => {
    vi.mocked(bookingApi.getCageAssignmentStatus).mockResolvedValue({
      data: { matched: false, cage: null },
      error: null,
    });

    render(createElement(CageAssignmentStatus, PROPS));

    await waitFor(() =>
      expect(
        screen.getByText(/No cage is currently available for Luna/)
      ).toBeInTheDocument()
    );
  });

  it('surfaces an error message when the request fails', async () => {
    vi.mocked(bookingApi.getCageAssignmentStatus).mockResolvedValue({
      data: null,
      error: 'Request failed. Please try again.',
    });

    render(createElement(CageAssignmentStatus, PROPS));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Request failed. Please try again.'
      )
    );
  });

  it('fetches with only accessToken/branchId/petId - no date or slot is required', async () => {
    vi.mocked(bookingApi.getCageAssignmentStatus).mockResolvedValue({
      data: { matched: true, cage: null },
      error: null,
    });

    render(createElement(CageAssignmentStatus, PROPS));

    await waitFor(() =>
      expect(bookingApi.getCageAssignmentStatus).toHaveBeenCalledWith(
        'token',
        'branch-1',
        'pet-1'
      )
    );
  });
});
