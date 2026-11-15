import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as customerApi from '../../../customers/api/customer.api';
import type { CustomerProfile } from '../../../customers/customer.types';
import * as bugReportsApi from '../../api/bugReports.api';
import type { BugReport } from '../../bugReports.types';
import { BugReportsQueuePage } from './BugReportsQueuePage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

vi.mock('../../../customers/api/customer.api', () => ({
  getCustomerProfile: vi.fn(),
}));

vi.mock('../../api/bugReports.api', () => ({
  listBugReports: vi.fn(),
  updateBugReportStatus: vi.fn(),
}));

function buildViewer(
  role: StaffRole,
  overrides: Partial<StaffProfile> = {}
): StaffProfile {
  return {
    id: 'dev-1',
    branch_id: 'branch-1',
    role,
    username: 'dev1',
    registered_email: 'dev1@example.com',
    display_name: 'Dana Developer',
    profile_photo_url: null,
    phone_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildReport(overrides: Partial<BugReport> = {}): BugReport {
  return {
    id: 'report-1',
    reporter_customer_id: 'cust-1',
    reporter_staff_id: null,
    category: 'bug',
    title: 'Upload fails',
    description: 'It spins forever.',
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildCustomer(
  overrides: Partial<CustomerProfile> = {}
): CustomerProfile {
  return {
    id: 'cust-1',
    full_name: 'Jamie Cruz',
    contact_number: null,
    emergency_contact_name: null,
    emergency_contact_number: null,
    preferred_communication_channel: null,
    account_email: 'jamie@example.com',
    primary_auth_provider: 'email',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'dev-1', email: 'dev1@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/developer/bug-reports'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/developer/bug-reports',
            element: createElement(BugReportsQueuePage),
          }),
          createElement(Route, {
            path: '/staff/settings',
            element: createElement('div', null, 'Staff settings page'),
          })
        )
      )
    )
  );
}

describe('BugReportsQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects a role that is not Developer or Superadmin (e.g. Admin)', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Staff settings page')).toBeInTheDocument()
    );
  });

  it('allows a Superadmin in too (oversight), not just Developer', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });
    vi.mocked(bugReportsApi.listBugReports).mockResolvedValue({
      data: [],
      error: null,
    });

    renderPage();

    expect(
      await screen.findByText('No reports submitted yet.')
    ).toBeInTheDocument();
  });

  it('loads and renders each report, resolving a customer reporter by name', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Developer')],
      error: null,
    });
    vi.mocked(bugReportsApi.listBugReports).mockResolvedValue({
      data: [buildReport()],
      error: null,
    });
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: buildCustomer(),
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Upload fails')).toBeInTheDocument();
    expect(screen.getByText('It spins forever.')).toBeInTheDocument();
    expect(screen.getByText('Bug report')).toBeInTheDocument();
    expect(await screen.findByText(/From Jamie Cruz/)).toBeInTheDocument();
  });

  it('resolves a staff reporter by display name', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [
        buildViewer('Developer'),
        buildViewer('Receptionist', {
          id: 'staff-2',
          display_name: 'Rey Receptionist',
        }),
      ],
      error: null,
    });
    vi.mocked(bugReportsApi.listBugReports).mockResolvedValue({
      data: [
        buildReport({
          reporter_customer_id: null,
          reporter_staff_id: 'staff-2',
          category: 'feature_request',
          title: 'Dark mode',
        }),
      ],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Dark mode')).toBeInTheDocument();
    expect(
      screen.getByText(/From Rey Receptionist \(staff\)/)
    ).toBeInTheDocument();
    expect(screen.getByText('Feature request')).toBeInTheDocument();
  });

  it('changing the status select calls updateBugReportStatus and reflects the new status', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Developer')],
      error: null,
    });
    vi.mocked(bugReportsApi.listBugReports).mockResolvedValue({
      data: [buildReport()],
      error: null,
    });
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: buildCustomer(),
      error: null,
    });
    vi.mocked(bugReportsApi.updateBugReportStatus).mockResolvedValue({
      data: buildReport({ status: 'resolved' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Upload fails');
    await user.selectOptions(screen.getByLabelText('Status'), 'resolved');

    await waitFor(() =>
      expect(bugReportsApi.updateBugReportStatus).toHaveBeenCalledWith(
        'report-1',
        'resolved',
        'token'
      )
    );
    expect(await screen.findAllByText('Resolved')).not.toHaveLength(0);
  });

  it('shows an error banner when a status update fails', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Developer')],
      error: null,
    });
    vi.mocked(bugReportsApi.listBugReports).mockResolvedValue({
      data: [buildReport()],
      error: null,
    });
    vi.mocked(customerApi.getCustomerProfile).mockResolvedValue({
      data: buildCustomer(),
      error: null,
    });
    vi.mocked(bugReportsApi.updateBugReportStatus).mockResolvedValue({
      data: null,
      error: 'Could not update the report.',
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Upload fails');
    await user.selectOptions(screen.getByLabelText('Status'), 'resolved');

    expect(
      await screen.findByText('Could not update the report.')
    ).toBeInTheDocument();
  });
});
