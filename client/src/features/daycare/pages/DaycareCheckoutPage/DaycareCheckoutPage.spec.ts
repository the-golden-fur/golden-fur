import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import * as daycareApi from '../../api/daycare.api';
import type { StaffProfile } from '../../../staff/staff.types';
import { DaycareCheckoutPage } from './DaycareCheckoutPage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));
vi.mock('../../api/daycare.api', () => ({
  checkOutDaycareSession: vi.fn(),
  listDaycareSessions: vi.fn(),
}));
vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
}));

function buildViewerProfile(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'reception-1',
    branch_id: 'branch-makati',
    role,
    username: 'reception1',
    registered_email: 'reception1@example.com',
    display_name: 'Reception One',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function renderPage(initialPath = '/staff/daycare/checkout/session-1') {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'reception-1', email: 'reception1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialPath] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/daycare/checkout/:sessionId',
            element: createElement(DaycareCheckoutPage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('div', null, 'Staff profile page'),
          })
        )
      )
    )
  );
}

describe('DaycareCheckoutPage (#69)', () => {
  beforeEach(() => {
    vi.mocked(daycareApi.listDaycareSessions).mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('AC-1: redirects a non-Receptionist/Admin/Supervisor/Superadmin viewer to /staff/settings', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('AC-2: shows the charge broken down by hours, matching the backend total exactly', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Receptionist'),
      error: null,
    });
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

    renderPage();

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
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Receptionist'),
      error: null,
    });
    vi.mocked(daycareApi.checkOutDaycareSession).mockResolvedValue({
      data: null,
      error: 'This daycare session is already checked out',
    });

    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: /check out/i })
    );

    expect(
      await screen.findByText('This daycare session is already checked out')
    ).toBeInTheDocument();
  });
});
