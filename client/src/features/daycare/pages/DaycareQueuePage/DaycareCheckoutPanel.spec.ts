import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as daycareApi from '../../api/daycare.api';
import { DaycareCheckoutPanel } from './DaycareCheckoutPanel';

vi.mock('../../api/daycare.api', () => ({
  checkOutDaycareSession: vi.fn(),
  listDaycareSessions: vi.fn(),
}));
vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
}));

function renderPanel(initialSessionId: string | null = 'session-1') {
  return render(
    createElement(DaycareCheckoutPanel, {
      accessToken: 'token',
      initialSessionId,
    })
  );
}

describe('DaycareCheckoutPanel (#69)', () => {
  beforeEach(() => {
    vi.mocked(daycareApi.listDaycareSessions).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('AC-2: shows the charge broken down by hours, matching the backend total exactly', async () => {
    vi.mocked(daycareApi.checkOutDaycareSession).mockResolvedValue({
      data: {
        id: 'session-1',
        booking_id: null,
        pet_id: 'pet-1',
        branch_id: 'branch-makati',
        created_by_staff_id: 'reception-1',
        status: 'Completed',
        check_in_at: '2026-07-19T02:00:00.000Z',
        check_out_at: '2026-07-19T04:10:00.000Z',
        computed_charge: 200,
        created_at: '2026-07-19T02:00:00.000Z',
        updated_at: '2026-07-19T04:10:00.000Z',
      },
      error: null,
    });

    renderPanel();

    expect(
      await screen.findByText('Ready to check out this session?')
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /check out/i }));

    await waitFor(() =>
      expect(daycareApi.checkOutDaycareSession).toHaveBeenCalledWith(
        'session-1',
        'token'
      )
    );

    const breakdown = document.querySelector('dl');
    expect(breakdown?.textContent).toContain('First hour');
    expect(breakdown?.textContent).toContain('₱100');
    expect(breakdown?.textContent).toContain('2 succeeding hours');
    expect(breakdown?.textContent).toContain('₱50');
    expect(breakdown?.textContent).toContain('Total');
    expect(breakdown?.textContent).toContain('₱200');
  });

  it('surfaces an error for an already-completed session', async () => {
    vi.mocked(daycareApi.checkOutDaycareSession).mockResolvedValue({
      data: null,
      error: 'This daycare session is already checked out',
    });

    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /check out/i })
    );

    expect(
      await screen.findByText('This daycare session is already checked out')
    ).toBeInTheDocument();
  });
});
