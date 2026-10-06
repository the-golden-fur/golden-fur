import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import type { AuthContextValue } from '../../../../shared/auth/providers/AuthProvider/AuthContext';
import * as staffApi from '../../../staff/api/staff.api';
import type { StaffProfile, StaffRole } from '../../../staff/staff.types';
import * as branchesApi from '../../api/branches.api';
import type { Branch } from '../../maintenance.types';
import { BranchesPage } from './BranchesPage';

vi.mock('../../../staff/api/staff.api', () => ({
  listStaff: vi.fn(),
}));

// The Policies form has its own dedicated spec - stub it here, but record the
// props so we can see the Configure modal embeds it for the right branch.
vi.mock(
  '../../../booking/pages/PolicyConfigurationPage/PolicyConfigurationPage',
  () => ({
    PolicyConfigurationPage: (props: {
      initialBranchId?: string;
      embedded?: boolean;
      lockBranchSelector?: boolean;
    }) =>
      createElement(
        'p',
        { 'data-testid': 'policies' },
        `policies for ${props.initialBranchId} embedded=${String(props.embedded)} locked=${String(props.lockBranchSelector)}`
      ),
  })
);

vi.mock('../../api/branches.api', () => ({
  listBranchesFull: vi.fn(),
  createBranch: vi.fn(),
  updateBranch: vi.fn(),
  archiveBranch: vi.fn(),
}));

function buildBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: 'branch-makati',
    name: 'Makati',
    address: '123 Ayala Ave',
    contact_number: '0917-000-0000',
    is_vet_branch: true,
    operating_hours: { monday: { open: '08:00', close: '18:00' } },
    grooming_hours: {},
    timezone: 'Asia/Manila',
    is_active: true,
    archived_at: null,
    created_at: '2026-06-25T00:00:00.000Z',
    ...overrides,
  };
}

function buildViewer(role: StaffRole): StaffProfile {
  return {
    id: 'admin-1',
    branch_id: 'branch-makati',
    role,
    username: 'viewer',
    registered_email: 'viewer@example.com',
    display_name: 'Signed-in Viewer',
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

function renderPage() {
  const authValue: AuthContextValue = {
    session: null,
    user: { id: 'admin-1', email: 'admin@example.com' },
    accessToken: 'token',
    isLoading: false,
    refreshSession: vi.fn(),
    applySession: vi.fn(),
    signOut: vi.fn(),
  };

  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/admin/maintenance/branches'] },
      createElement(
        AuthContext.Provider,
        { value: authValue },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/staff/admin/maintenance/branches',
            element: createElement(BranchesPage),
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

describe('BranchesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Superadmin')],
      error: null,
    });
    vi.mocked(branchesApi.listBranchesFull).mockResolvedValue({
      data: [buildBranch()],
      error: null,
    });
  });

  it('redirects a non-Superadmin (e.g. Admin) role to /staff/settings', async () => {
    vi.mocked(staffApi.listStaff).mockResolvedValue({
      data: [buildViewer('Admin')],
      error: null,
    });

    renderPage();

    expect(await screen.findByText('Staff profile page')).toBeInTheDocument();
    expect(branchesApi.listBranchesFull).not.toHaveBeenCalled();
  });

  it('lists branches with name, address, type, and status', async () => {
    renderPage();

    expect(await screen.findByText('Makati')).toBeInTheDocument();
    expect(screen.getByText('123 Ayala Ave')).toBeInTheDocument();
    expect(screen.getByText('Veterinary')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('adds a branch via the modal', async () => {
    vi.mocked(branchesApi.createBranch).mockResolvedValue({
      data: buildBranch({ id: 'branch-new', name: 'Southwoods' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(screen.getByRole('button', { name: '+ Add branch' }));

    const dialog = screen.getByRole('dialog', { name: 'Add branch' });
    await user.type(within(dialog).getByLabelText('Branch name'), 'Southwoods');
    await user.type(
      within(dialog).getByLabelText('Address'),
      '456 Filinvest Ave'
    );
    // Timezone already defaults to 'Asia/Manila' (EMPTY_FORM) - no need to
    // clear/retype it, that's what the payload assertion below expects.
    await user.click(
      within(dialog).getByRole('button', { name: 'Add branch' })
    );

    await waitFor(() =>
      expect(branchesApi.createBranch).toHaveBeenCalledWith('token', {
        name: 'Southwoods',
        address: '456 Filinvest Ave',
        contact_number: null,
        is_vet_branch: false,
        timezone: 'Asia/Manila',
        operating_hours: {},
        grooming_hours: {},
      })
    );
    expect(await screen.findByText('Southwoods')).toBeInTheDocument();
  }, 15000); // heavier than the other tests here (full create form incl.
  // the 7-day operating-hours table) - flaky against the 5s default only
  // under parallel test-file load, passes well within it standalone.

  it('a row offers Configure, Rename and Archive - never Details, Deactivate or Reactivate', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati' })
    );

    for (const name of ['Configure', 'Rename', 'Archive']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('menuitem', { name: 'Details' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Deactivate' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Reactivate' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Edit' })
    ).not.toBeInTheDocument();
  });

  it('Rename saves only the branch name', async () => {
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: buildBranch({ name: 'Makati Central' }),
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = screen.getByRole('textbox', { name: /new branch name/i });
    await user.clear(input);
    await user.type(input, 'Makati Central');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(branchesApi.updateBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token',
        { name: 'Makati Central' }
      )
    );
    expect(await screen.findByText('Makati Central')).toBeInTheDocument();
  });

  it('archives an active branch from the "..." menu after confirming', async () => {
    vi.mocked(branchesApi.archiveBranch).mockResolvedValue({
      data: null,
      error: null,
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));

    expect(branchesApi.archiveBranch).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() =>
      expect(branchesApi.archiveBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token'
      )
    );
    await waitFor(() =>
      expect(screen.queryByText('Makati')).not.toBeInTheDocument()
    );
  });

  async function openConfigure() {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Makati');

    await user.click(
      screen.getByRole('button', { name: 'Actions for Makati' })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Configure' }));

    return {
      user,
      dialog: await screen.findByRole('dialog', { name: 'Configure Makati' }),
    };
  }

  it('Configure opens ONE modal (not a page) with the branch details and its policies', async () => {
    const { dialog } = await openConfigure();

    expect(within(dialog).getByLabelText('Branch name')).toHaveValue('Makati');
    expect(within(dialog).getByLabelText('Monday opening time')).toHaveValue(
      '08:00'
    );
    // Policies are embedded in the same modal, pre-scoped and locked to it.
    expect(within(dialog).getByTestId('policies')).toHaveTextContent(
      'policies for branch-makati embedded=true locked=true'
    );
    // Still on the Branches list underneath - nothing navigated away.
    expect(
      screen.getByRole('heading', { name: 'Branches' })
    ).toBeInTheDocument();
  });

  it('saving the details in the Configure modal calls updateBranch and updates the list behind it', async () => {
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: buildBranch({ address: '456 Makati Ave' }),
      error: null,
    });
    const { user, dialog } = await openConfigure();

    const address = within(dialog).getByLabelText('Address');
    await user.clear(address);
    await user.type(address, '456 Makati Ave');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save details' })
    );

    await waitFor(() =>
      expect(branchesApi.updateBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token',
        expect.objectContaining({ address: '456 Makati Ave' })
      )
    );
    expect(
      await within(dialog).findByText('Branch details saved.')
    ).toBeInTheDocument();
  });

  it('limiting grooming hours on a day saves that day in grooming_hours', async () => {
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: buildBranch({
        grooming_hours: { monday: { open: '10:00', close: '15:00' } },
      }),
      error: null,
    });
    const { user, dialog } = await openConfigure();

    // Only open days offer it - Monday is the only open day here.
    expect(
      within(dialog).queryByRole('checkbox', {
        name: 'Limit grooming hours on Tuesday',
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'Limit grooming hours on Monday',
      })
    );
    fireEvent.change(
      within(dialog).getByLabelText('Monday grooming start time'),
      {
        target: { value: '10:00' },
      }
    );
    fireEvent.change(
      within(dialog).getByLabelText('Monday grooming end time'),
      {
        target: { value: '15:00' },
      }
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Save details' })
    );

    await waitFor(() =>
      expect(branchesApi.updateBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token',
        expect.objectContaining({
          operating_hours: { monday: { open: '08:00', close: '18:00' } },
          grooming_hours: { monday: { open: '10:00', close: '15:00' } },
        })
      )
    );
  });

  it('refuses a grooming end time that is not after its start, without calling the API', async () => {
    const { user, dialog } = await openConfigure();

    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'Limit grooming hours on Monday',
      })
    );
    // Both inside Monday's 08:00-18:00, so the browser's own min/max check
    // on the time inputs lets the form submit - the range itself is wrong.
    fireEvent.change(
      within(dialog).getByLabelText('Monday grooming start time'),
      { target: { value: '15:00' } }
    );
    fireEvent.change(
      within(dialog).getByLabelText('Monday grooming end time'),
      {
        target: { value: '10:00' },
      }
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Save details' })
    );

    expect(
      await within(dialog).findByText(
        'Monday: the grooming end time must be after its start time.'
      )
    ).toBeInTheDocument();
    expect(branchesApi.updateBranch).not.toHaveBeenCalled();
  });

  it('"Apply to all days" copies one set of hours and grooming hours onto every day', async () => {
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: buildBranch(),
      error: null,
    });
    const { user, dialog } = await openConfigure();

    fireEvent.change(within(dialog).getByLabelText('All days opening time'), {
      target: { value: '08:00' },
    });
    fireEvent.change(within(dialog).getByLabelText('All days closing time'), {
      target: { value: '17:00' },
    });
    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'Limit grooming hours on all days',
      })
    );
    fireEvent.change(
      within(dialog).getByLabelText('All days grooming start time'),
      { target: { value: '10:00' } }
    );
    fireEvent.change(
      within(dialog).getByLabelText('All days grooming end time'),
      { target: { value: '15:00' } }
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Apply to all days' })
    );

    // Every day's own row now shows the copied times, closed days included.
    expect(within(dialog).getByLabelText('Sunday opening time')).toHaveValue(
      '08:00'
    );
    expect(
      within(dialog).getByLabelText('Sunday grooming end time')
    ).toHaveValue('15:00');

    await user.click(
      within(dialog).getByRole('button', { name: 'Save details' })
    );

    const days = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];

    await waitFor(() =>
      expect(branchesApi.updateBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token',
        expect.objectContaining({
          operating_hours: Object.fromEntries(
            days.map((day) => [day, { open: '08:00', close: '17:00' }])
          ),
          grooming_hours: Object.fromEntries(
            days.map((day) => [day, { open: '10:00', close: '15:00' }])
          ),
        })
      )
    );
  });

  it('"Apply to all days" without a grooming limit clears every day\'s grooming hours', async () => {
    vi.mocked(branchesApi.listBranchesFull).mockResolvedValue({
      data: [
        buildBranch({
          grooming_hours: { monday: { open: '10:00', close: '15:00' } },
        }),
      ],
      error: null,
    });
    const { user, dialog } = await openConfigure();

    await user.click(
      within(dialog).getByRole('button', { name: 'Apply to all days' })
    );

    expect(
      within(dialog).queryByLabelText('Monday grooming start time')
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Monday opening time')).toHaveValue(
      '09:00'
    );
  });

  it('Undo appears after "Apply to all days" and restores the previous hours', async () => {
    vi.mocked(branchesApi.listBranchesFull).mockResolvedValue({
      data: [
        buildBranch({
          grooming_hours: { monday: { open: '10:00', close: '15:00' } },
        }),
      ],
      error: null,
    });
    const { user, dialog } = await openConfigure();

    expect(
      within(dialog).queryByRole('button', { name: 'Undo' })
    ).not.toBeInTheDocument();

    // Applying twice must still undo back to the original hours.
    await user.click(
      within(dialog).getByRole('button', { name: 'Apply to all days' })
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Apply to all days' })
    );
    expect(within(dialog).getByLabelText('Monday opening time')).toHaveValue(
      '09:00'
    );
    expect(
      within(dialog).getByLabelText('Sunday opening time')
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Undo' }));

    expect(within(dialog).getByLabelText('Monday opening time')).toHaveValue(
      '08:00'
    );
    expect(
      within(dialog).getByLabelText('Monday grooming start time')
    ).toHaveValue('10:00');
    // Sunday was closed before the apply, and is closed again.
    expect(
      within(dialog).queryByLabelText('Sunday opening time')
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Undo' })
    ).not.toBeInTheDocument();
  });

  it('marking a day Closed clears its grooming hours', async () => {
    vi.mocked(branchesApi.listBranchesFull).mockResolvedValue({
      data: [
        buildBranch({
          grooming_hours: { monday: { open: '10:00', close: '15:00' } },
        }),
      ],
      error: null,
    });
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: buildBranch({ operating_hours: {} }),
      error: null,
    });
    const { user, dialog } = await openConfigure();

    expect(
      within(dialog).getByLabelText('Monday grooming start time')
    ).toHaveValue('10:00');

    // Monday's own "Closed" tick box is the second checkbox row-wise; pick
    // it through its row to stay independent of the other days.
    const mondayRow = within(dialog).getByText('Monday').closest('div');
    await user.click(within(mondayRow as HTMLElement).getByLabelText('Closed'));
    await user.click(
      within(dialog).getByRole('button', { name: 'Save details' })
    );

    await waitFor(() =>
      expect(branchesApi.updateBranch).toHaveBeenCalledWith(
        'branch-makati',
        'token',
        expect.objectContaining({ operating_hours: {}, grooming_hours: {} })
      )
    );
  });

  it('shows the server error inside the Configure modal when saving the details fails', async () => {
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: null,
      error: 'Address is invalid',
    });
    const { user, dialog } = await openConfigure();

    await user.click(
      within(dialog).getByRole('button', { name: 'Save details' })
    );

    expect(await within(dialog).findByText('Address is invalid')).toBeVisible();
  });

  it('closes the Configure modal with the close button', async () => {
    const { user } = await openConfigure();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks before discarding unsaved branch details, and keeps the edits on "Keep editing"', async () => {
    const { user, dialog } = await openConfigure();

    await user.type(within(dialog).getByLabelText('Address'), ' Unit 2');
    await user.click(dialog.parentElement as HTMLElement);

    const confirm = await screen.findByRole('dialog', {
      name: 'Discard unsaved changes?',
    });
    await user.click(
      within(confirm).getByRole('button', { name: 'Keep editing' })
    );

    expect(
      screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole('dialog', { name: 'Configure Makati' })
      ).getByLabelText('Address')
    ).toHaveValue('123 Ayala Ave Unit 2');
  });

  it('"Discard changes" closes the Configure modal, from the Close button too', async () => {
    const { user, dialog } = await openConfigure();

    await user.type(within(dialog).getByLabelText('Address'), ' Unit 2');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    const confirm = await screen.findByRole('dialog', {
      name: 'Discard unsaved changes?',
    });
    await user.click(
      within(confirm).getByRole('button', { name: 'Discard changes' })
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(branchesApi.updateBranch).not.toHaveBeenCalled();
  });

  it('does not ask again once the details were saved', async () => {
    vi.mocked(branchesApi.updateBranch).mockResolvedValue({
      data: buildBranch({ address: '456 Makati Ave' }),
      error: null,
    });
    const { user, dialog } = await openConfigure();

    const address = within(dialog).getByLabelText('Address');
    await user.clear(address);
    await user.type(address, '456 Makati Ave');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save details' })
    );
    await within(dialog).findByText('Branch details saved.');

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the Configure modal when clicking outside it, but not when clicking inside', async () => {
    const { user, dialog } = await openConfigure();

    await user.click(within(dialog).getByLabelText('Address'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The backdrop is the dialog's own wrapper.
    await user.click(dialog.parentElement as HTMLElement);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
