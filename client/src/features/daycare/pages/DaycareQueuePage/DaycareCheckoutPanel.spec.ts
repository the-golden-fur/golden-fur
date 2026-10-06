import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as daycareApi from '../../api/daycare.api';
import { DaycareCheckoutPanel } from './DaycareCheckoutPanel';

vi.mock('../../api/daycare.api', () => ({
  checkOutDaycareSession: vi.fn(),
}));

function renderPanel(sessionId = 'session-1') {
  return render(
    createElement(DaycareCheckoutPanel, {
      accessToken: 'token',
      sessionId,
    })
  );
}

describe('DaycareCheckoutPanel (#69)', () => {
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
        actual_check_out_at: '2026-07-19T04:10:00.000Z',
        computed_charge: 200,
        created_at: '2026-07-19T02:00:00.000Z',
        updated_at: '2026-07-19T04:10:00.000Z',
        charge_breakdown: {
          first_hour_fee: 100,
          succeeding_hours: 2,
          succeeding_hour_fee: 50,
          hourly_charge: 200,
          nights: 0,
          nightly_rate: null,
          overnight_charge: 0,
          total: 200,
        },
      } as never,
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
    expect(breakdown?.textContent).not.toContain('Not picked up');
    expect(breakdown?.textContent).not.toContain('Overdue checkout');
  });

  it('itemizes the night(s) at the Hotel rate for a pet not picked up before closing', async () => {
    vi.mocked(daycareApi.checkOutDaycareSession).mockResolvedValue({
      data: {
        id: 'session-1',
        status: 'Completed',
        check_in_at: '2026-07-19T08:00:00.000Z',
        actual_check_out_at: '2026-07-20T01:00:00.000Z',
        computed_charge: 1000,
        charge_breakdown: {
          first_hour_fee: 100,
          succeeding_hours: 1,
          succeeding_hour_fee: 50,
          hourly_charge: 150,
          nights: 1,
          nightly_rate: 850,
          overnight_charge: 850,
          total: 1000,
        },
      } as never,
      error: null,
    });

    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /check out/i })
    );

    const breakdown = await waitFor(() => {
      const list = document.querySelector('dl');
      expect(list).not.toBeNull();
      return list;
    });
    expect(breakdown?.textContent).toContain('1 succeeding hour × ₱50');
    expect(breakdown?.textContent).toContain(
      'Not picked up before closing - 1 night × ₱850 (Hotel rate)'
    );
    expect(breakdown?.textContent).toContain('₱1000');
  });

  it('itemizes the overdue checkout fee for a booked pet picked up late', async () => {
    vi.mocked(daycareApi.checkOutDaycareSession).mockResolvedValue({
      data: {
        id: 'session-1',
        status: 'Completed',
        computed_charge: 250,
        charge_breakdown: {
          first_hour_fee: 100,
          succeeding_hours: 1,
          succeeding_hour_fee: 50,
          hourly_charge: 150,
          overdue_hours: 2,
          overdue_hour_fee: 50,
          overdue_charge: 100,
          nights: 0,
          nightly_rate: null,
          overnight_charge: 0,
          total: 250,
        },
      } as never,
      error: null,
    });

    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: /check out/i })
    );

    const breakdown = await waitFor(() => {
      const list = document.querySelector('dl');
      expect(list).not.toBeNull();
      return list;
    });
    expect(breakdown?.textContent).toContain(
      'Overdue checkout - 2 hours × ₱50'
    );
    expect(breakdown?.textContent).toContain('₱100');
    expect(breakdown?.textContent).toContain('₱250');
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
