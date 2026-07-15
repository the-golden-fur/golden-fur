import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../api/staff.api';
import type {
  PendingUnavailabilityBlock,
  StaffProfile,
} from '../../staff.types';
import { UnavailabilityApprovalQueuePage } from './UnavailabilityApprovalQueuePage';

vi.mock('../../api/staff.api', () => ({
  getStaffProfile: vi.fn(),
  listPendingUnavailabilityRequests: vi.fn(),
  reviewUnavailabilityRequest: vi.fn(),
}));

function buildViewerProfile(role: StaffProfile['role']): StaffProfile {
  return {
    id: 'admin-1',
    branch_id: 'branch-a',
    role,
    username: 'admin1',
    registered_email: 'admin1@example.com',
    display_name: 'Admin One',
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

function buildPendingBlock(
  overrides: Partial<PendingUnavailabilityBlock> = {}
): PendingUnavailabilityBlock {
  return {
    id: 'block-1',
    staff_id: 'staff-2',
    start_time: '2026-07-14T01:00:00.000Z',
    end_time: '2026-07-14T03:00:00.000Z',
    reason: null,
    created_by: 'staff-2',
    created_at: '2026-07-13T00:00:00.000Z',
    status: 'pending',
    is_quick_action: false,
    reviewed_by: null,
    reviewed_at: null,
    denial_reason: null,
    reviewable: true,
    staff: {
      id: 'staff-2',
      display_name: 'Staff Two',
      profile_photo_url: null,
      role: 'Groomer',
      branch_id: 'branch-a',
    },
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'admin-1', email: 'admin1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/admin/unavailability'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/unavailability',
            element: createElement(UnavailabilityApprovalQueuePage),
          }),
          createElement(Route, {
            path: '/staff/profile',
            element: createElement('div', null, 'Staff profile page'),
          })
        )
      )
    )
  );
}

describe('UnavailabilityApprovalQueuePage', () => {
  it('AC-1: redirects a non-Admin/Supervisor/Superadmin viewer to /staff/profile', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Groomer'),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
  });

  it('AC-1 & AC-2: a Supervisor viewer sees the pending queue', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Supervisor'),
      error: null,
    });
    vi.mocked(staffApi.listPendingUnavailabilityRequests).mockResolvedValue({
      data: [buildPendingBlock()],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff Two')).toBeInTheDocument();
  });

  it('AC-3: clicking Approve calls the review API and removes the card', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Admin'),
      error: null,
    });
    vi.mocked(staffApi.listPendingUnavailabilityRequests).mockResolvedValue({
      data: [buildPendingBlock()],
      error: null,
    });
    vi.mocked(staffApi.reviewUnavailabilityRequest).mockResolvedValue({
      data: {
        id: 'block-1',
        staff_id: 'staff-2',
        start_time: '2026-07-14T01:00:00.000Z',
        end_time: '2026-07-14T03:00:00.000Z',
        reason: null,
        created_by: 'staff-2',
        created_at: '2026-07-13T00:00:00.000Z',
        status: 'approved',
        is_quick_action: false,
        reviewed_by: 'admin-1',
        reviewed_at: '2026-07-14T00:00:00.000Z',
        denial_reason: null,
      },
      error: null,
    });

    renderPage();

    await screen.findByText('Staff Two');
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() =>
      expect(staffApi.reviewUnavailabilityRequest).toHaveBeenCalledWith(
        'staff-2',
        'block-1',
        'token',
        { decision: 'approved', denial_reason: undefined }
      )
    );
    expect(screen.queryByText('Staff Two')).not.toBeInTheDocument();
  });

  it('#30 AC-7: a non-reviewable card (viewer’s own request) has no Approve/Deny buttons', async () => {
    vi.mocked(staffApi.getStaffProfile).mockResolvedValue({
      data: buildViewerProfile('Admin'),
      error: null,
    });
    vi.mocked(staffApi.listPendingUnavailabilityRequests).mockResolvedValue({
      data: [
        buildPendingBlock({
          id: 'block-own',
          staff_id: 'admin-1',
          reviewable: false,
          staff: {
            id: 'admin-1',
            display_name: 'Admin One',
            profile_photo_url: null,
            role: 'Admin',
            branch_id: 'branch-a',
          },
        }),
      ],
      error: null,
    });

    renderPage();

    await screen.findByText('Admin One');
    expect(
      screen.queryByRole('button', { name: /approve/i })
    ).not.toBeInTheDocument();
  });
});
