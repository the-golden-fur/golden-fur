import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile } from '../../../staff/staff.types';
import * as customerApi from '../../../customers/api/customer.api';
import * as daycareApi from '../../../daycare/api/daycare.api';
import { BoardingChecklistPage } from './BoardingChecklistPage';

vi.mock('../../../staff/api/staff.api', () => ({
  getStaffProfile: vi.fn(),
}));
vi.mock('../../../customers/api/customer.api', () => ({
  getPet: vi.fn(),
}));
vi.mock('../../../daycare/api/daycare.api', () => ({
  listDaycareSessions: vi.fn(),
}));
vi.mock(
  '../../components/BoardingChecklistKanban/BoardingChecklistKanban',
  () => ({
    BoardingChecklistKanban: (props: { petId?: string }) =>
      createElement(
        'div',
        { 'data-testid': 'kanban' },
        props.petId ? `Scoped to ${props.petId}` : 'Unscoped'
      ),
  })
);
vi.mock('../../../daycare/pages/DaycareQueuePage/DaycareCheckoutPanel', () => ({
  DaycareCheckoutPanel: (props: { sessionId: string }) =>
    createElement('div', null, `Checkout panel for ${props.sessionId}`),
}));

function buildViewerProfile(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'staff-1',
    branch_id: 'branch-makati',
    role,
    username: 'staff1',
    registered_email: 'staff1@example.com',
    display_name: 'Staff One',
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

function renderPage(initialEntry = '/staff/hotel/care-log') {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'staff-1', email: 'staff1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/hotel/care-log',
            element: createElement(BoardingChecklistPage),
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

describe('BoardingChecklistPage (Daycare Queue redesign: petId scoping + checkout)', () => {
  it('redirects a role that cannot view the checklist', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Cashier'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('with no petId: renders the unscoped board and no checkout section', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Unscoped')).toBeInTheDocument();
    expect(screen.getByText('Boarding Checklist')).toBeInTheDocument();
    expect(screen.queryByText(/Checkout panel for/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Back to Daycare Queue/)).not.toBeInTheDocument();
  });

  it('with a petId and an active Daycare session: scopes the board and shows the Check Out section', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(customerApi.getPet).mockResolvedValue({
      data: {
        id: 'pet-1',
        customer_id: 'cust-1',
        name: 'Buddy',
        pet_type: 'Dog',
        breed_id: null,
        photo_url: null,
        gender: 'Male',
        date_of_birth: null,
        weight_class: 'M',
        coat_type: 'SC',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });
    vi.mocked(daycareApi.listDaycareSessions).mockResolvedValue({
      data: [
        {
          id: 'session-1',
          stay_type: 'Daycare',
          booking_id: 'booking-1',
          pet_id: 'pet-1',
          branch_id: 'branch-makati',
          cage_id: null,
          created_by_staff_id: 'staff-1',
          status: 'Active',
          check_in_at: '2026-09-12T01:00:00.000Z',
          scheduled_check_out_date: null,
          actual_check_out_at: null,
          downpayment_amount: null,
          extension_fee: null,
          computed_charge: null,
          notify_opt_in: false,
          created_at: '2026-09-12T01:00:00.000Z',
          updated_at: '2026-09-12T01:00:00.000Z',
        },
      ],
      error: null,
    });

    renderPage('/staff/hotel/care-log?petId=pet-1');

    expect(await screen.findByText('Scoped to pet-1')).toBeInTheDocument();
    expect(
      await screen.findByText('Boarding Checklist — Buddy')
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Checkout panel for session-1')
    ).toBeInTheDocument();
    expect(screen.getByText(/Back to Daycare Queue/)).toBeInTheDocument();
  });

  it('with a petId but no active session: no Check Out section', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });
    vi.mocked(customerApi.getPet).mockResolvedValue({
      data: null,
      error: 'not found',
    });
    vi.mocked(daycareApi.listDaycareSessions).mockResolvedValue({
      data: [],
      error: null,
    });

    renderPage('/staff/hotel/care-log?petId=pet-1');

    await screen.findByText('Scoped to pet-1');
    expect(screen.queryByText(/Checkout panel for/)).not.toBeInTheDocument();
  });
});
